import express from 'express';
import axios from 'axios';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { verifyToken } from '../utils/auth.js';
import { getProductReviews, getReviewSentiment, insertReview } from '../utils/db.js';

const router = express.Router();

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseMaybeJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const sentimentFromRating = (rating) => {
  if (rating >= 4) return 'positive';
  if (rating <= 2) return 'negative';
  return 'neutral';
};

const extractOccurrences = (text, keyword) => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(`\\b${escaped}\\b`, 'gi'));
  return matches ? matches.length : 0;
};

const safeUrl = (url) => {
  try {
    const parsed = new URL(url);
    const validProtocol = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    return validProtocol ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const stripHtml = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parsePriceValues = (content) => {
  const regex = /(?:₹|Rs\.?|INR|\$|€|£)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi;
  const values = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1]?.replace(/,/g, '');
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) values.push(numeric);
    if (values.length >= 30) break;
  }

  return [...new Set(values)];
};

const formatMoney = (value) => {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Number(value.toFixed(2));
};

const detectPlatform = (hostname = '') => {
  const host = hostname.toLowerCase();
  if (host.includes('amazon')) return 'Amazon';
  if (host.includes('flipkart')) return 'Flipkart';
  if (host.includes('meesho')) return 'Meesho';
  if (host.includes('myntra')) return 'Myntra';
  return 'Own Website';
};

const browserLikeHeaders = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

const mirrorUrl = (targetUrl) => `https://r.jina.ai/http://${targetUrl.replace(/^https?:\/\//i, '')}`;

const extractJsonLdBlocks = (html) => {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }

  return blocks;
};

const collectOffers = (node, output = []) => {
  if (!node) return output;
  if (Array.isArray(node)) {
    node.forEach((item) => collectOffers(item, output));
    return output;
  }

  if (typeof node === 'object') {
    if (node.offers) output.push(node.offers);
    Object.values(node).forEach((value) => {
      if (value && typeof value === 'object') collectOffers(value, output);
    });
  }

  return output;
};

const firstNumber = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

const fetchPageWithFallback = async (url) => {
  let html = '';
  let finalUrl = url;
  let warning = null;
  let fetchMode = 'direct';

  try {
    const response = await axios.get(url, {
      timeout: 12000,
      maxContentLength: 2_000_000,
      maxRedirects: 10,
      headers: browserLikeHeaders
    });

    html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    finalUrl = response.request?.res?.responseUrl || url;
  } catch (error) {
    warning = `Direct fetch blocked (${error.response?.status || 'network error'})`;
  }

  const looksBlocked = !html || html.length < 1200 || /captcha|robot check|access denied|forbidden/i.test(html);

  if (looksBlocked) {
    try {
      const mirrorResponse = await axios.get(mirrorUrl(finalUrl), {
        timeout: 14000,
        maxContentLength: 2_000_000,
        headers: browserLikeHeaders
      });

      const mirrorText = typeof mirrorResponse.data === 'string'
        ? mirrorResponse.data
        : JSON.stringify(mirrorResponse.data);

      if (mirrorText && mirrorText.length > html.length) {
        html = mirrorText;
        fetchMode = 'mirror';
      }

      warning = warning
        ? `${warning}. Used fallback mirror extraction.`
        : 'Used fallback mirror extraction for better parsing.';
    } catch (mirrorError) {
      warning = warning
        ? `${warning}. Mirror fallback also failed (${mirrorError.response?.status || 'network error'}).`
        : `Could not fetch page content (${mirrorError.response?.status || 'network error'}). Showing partial analysis.`;
    }
  }

  return { html, finalUrl, warning, fetchMode };
};

// URL Analyzer for review/price intelligence
router.post('/url-analyze', verifyToken, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Product URL is required' });
    }

    const normalizedUrl = safeUrl(url.trim());
    if (!normalizedUrl) {
      return res.status(400).json({ success: false, error: 'Enter a valid URL with http/https' });
    }

    const { html, finalUrl, warning: fetchWarning, fetchMode } = await fetchPageWithFallback(normalizedUrl);
    const parsedUrl = new URL(finalUrl || normalizedUrl);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || parsedUrl.hostname;

    const combinedText = `${html} ${stripHtml(html)}`;
    const textLower = combinedText.toLowerCase();
    const jsonLdBlocks = extractJsonLdBlocks(html);

    let jsonLdRating = null;
    let jsonLdReviewCount = null;
    let jsonLdCurrentPrice = null;
    let jsonLdOldPrice = null;

    for (const block of jsonLdBlocks) {
      const aggregateRating = block?.aggregateRating || (Array.isArray(block) ? null : null);
      if (aggregateRating) {
        if (jsonLdRating === null) jsonLdRating = firstNumber(aggregateRating.ratingValue);
        if (jsonLdReviewCount === null) jsonLdReviewCount = firstNumber(aggregateRating.reviewCount || aggregateRating.ratingCount);
      }

      const offers = collectOffers(block);
      for (const offer of offers) {
        if (Array.isArray(offer)) {
          for (const item of offer) {
            if (jsonLdCurrentPrice === null) jsonLdCurrentPrice = firstNumber(item?.price || item?.lowPrice);
            if (jsonLdOldPrice === null) jsonLdOldPrice = firstNumber(item?.highPrice || item?.priceSpecification?.price);
          }
        } else {
          if (jsonLdCurrentPrice === null) jsonLdCurrentPrice = firstNumber(offer?.price || offer?.lowPrice);
          if (jsonLdOldPrice === null) jsonLdOldPrice = firstNumber(offer?.highPrice || offer?.priceSpecification?.price);
        }
      }
    }

    const priceValues = parsePriceValues(combinedText).sort((a, b) => b - a);
    let oldPrice = null;
    let newPrice = null;

    const oldPriceHint = combinedText.match(/(?:M\.?R\.?P\.?|List\s*Price|Old\s*Price|Was)\D{0,20}(?:₹|Rs\.?|INR|\$|€|£)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    const newPriceHint = combinedText.match(/(?:Deal\s*Price|Sale\s*Price|Current\s*Price|Now|Price)\D{0,20}(?:₹|Rs\.?|INR|\$|€|£)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    const hintedOld = firstNumber(oldPriceHint?.[1]);
    const hintedNew = firstNumber(newPriceHint?.[1]);

    if (jsonLdOldPrice && jsonLdCurrentPrice && jsonLdOldPrice > jsonLdCurrentPrice) {
      oldPrice = formatMoney(jsonLdOldPrice);
      newPrice = formatMoney(jsonLdCurrentPrice);
    } else if (hintedOld && hintedNew && hintedOld > hintedNew) {
      oldPrice = formatMoney(hintedOld);
      newPrice = formatMoney(hintedNew);
    }

    if (!oldPrice && !newPrice && priceValues.length >= 2) {
      oldPrice = formatMoney(priceValues[0]);
      newPrice = formatMoney(priceValues[priceValues.length - 1]);
    } else if (!oldPrice && !newPrice && priceValues.length === 1) {
      newPrice = formatMoney(priceValues[0]);
    }

    if (!newPrice && jsonLdCurrentPrice) newPrice = formatMoney(jsonLdCurrentPrice);
    if (!oldPrice && jsonLdOldPrice && newPrice && jsonLdOldPrice > newPrice) oldPrice = formatMoney(jsonLdOldPrice);

    let discountPercent = null;
    if (oldPrice && newPrice && oldPrice > newPrice) {
      discountPercent = Number((((oldPrice - newPrice) / oldPrice) * 100).toFixed(2));
    }

    const ratingMatch = combinedText.match(/([0-5](?:\.\d)?)\s*(?:out of 5|\/5|stars?)/i);
    const rating = jsonLdRating ?? (ratingMatch ? Number(ratingMatch[1]) : null);

    const reviewsMatch = combinedText.match(/([0-9][0-9,]{0,12})\s*(?:ratings?|reviews?)/i);
    const reviewCount = jsonLdReviewCount ?? (reviewsMatch ? Number(reviewsMatch[1].replace(/,/g, '')) : 0);

    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'quality', 'value', 'recommended', 'durable', 'best', 'fast'];
    const negativeWords = ['bad', 'poor', 'worst', 'fake', 'defect', 'slow', 'return', 'refund', 'broken', 'issue'];
    const neutralWords = ['average', 'okay', 'normal', 'decent', 'satisfactory'];

    const positiveHits = positiveWords.reduce((sum, word) => sum + extractOccurrences(textLower, word), 0);
    const negativeHits = negativeWords.reduce((sum, word) => sum + extractOccurrences(textLower, word), 0);
    const neutralHits = neutralWords.reduce((sum, word) => sum + extractOccurrences(textLower, word), 0);

    const inferredPositive = rating ? Math.max(0, Math.round((rating / 5) * 100)) : 0;
    const inferredNegative = rating ? Math.max(0, Math.round(((5 - rating) / 5) * 100)) : 0;

    const sentiment = {
      positive: positiveHits > 0 || negativeHits > 0 ? positiveHits : inferredPositive,
      neutral: neutralHits > 0 ? neutralHits : Math.max(0, 100 - inferredPositive - inferredNegative),
      negative: positiveHits > 0 || negativeHits > 0 ? negativeHits : inferredNegative
    };

    const discountEffect = discountPercent === null
      ? {
          impact: 'unknown',
          effect: 'Discount not clearly detected from URL data.',
          marginRisk: 'unknown'
        }
      : discountPercent >= 20
        ? {
            impact: 'high-demand-boost',
            effect: 'Strong conversion boost likely, especially for price-sensitive buyers.',
            marginRisk: 'high'
          }
        : discountPercent >= 10
          ? {
              impact: 'moderate-demand-boost',
              effect: 'Moderate uplift expected with manageable margin pressure.',
              marginRisk: 'medium'
            }
          : {
              impact: 'low-demand-boost',
              effect: 'Small short-term impact expected; differentiation should come from quality/reviews.',
              marginRisk: 'low'
            };

    let qualityBand = 'average';
    if ((rating !== null && rating >= 4.3) || sentiment.positive > sentiment.negative * 1.8) qualityBand = 'best';
    if ((rating !== null && rating < 3.5) || sentiment.negative > sentiment.positive * 1.2) qualityBand = 'worst';

    const { data: ownReviews } = await supabaseAdmin
      .from('reviews')
      .select('rating')
      .eq('seller_id', req.user.userId)
      .limit(500);

    const portfolioRatings = (ownReviews || []).map((row) => Number(row.rating)).filter((value) => Number.isFinite(value));
    const portfolioAvgRating = portfolioRatings.length > 0
      ? Number((portfolioRatings.reduce((sum, value) => sum + value, 0) / portfolioRatings.length).toFixed(2))
      : null;

    const ratingForScoring = rating ?? 3.6;
    const discountForScoring = discountPercent ?? 0;
    const sentimentSignal = Math.max(-20, Math.min(20, sentiment.positive - sentiment.negative));

    let investScore = 45 + ratingForScoring * 8 + discountForScoring * 0.7 + sentimentSignal * 0.35;
    if (qualityBand === 'worst') investScore -= 15;
    if (portfolioAvgRating && rating && rating < portfolioAvgRating - 0.4) investScore -= 8;
    if (portfolioAvgRating && rating && rating > portfolioAvgRating + 0.3) investScore += 6;
    investScore = Math.max(0, Math.min(100, Math.round(investScore)));

    let decision = 'watch';
    if (investScore >= 70) decision = 'invest';
    if (investScore < 50) decision = 'do-not-invest';

    const reasons = [
      rating ? `Detected rating: ${rating}/5` : 'No clear public rating detected from URL content',
      discountPercent !== null
        ? `Detected discount: ${discountPercent}% (${oldPrice} → ${newPrice})`
        : 'No reliable old/new price pair detected',
      portfolioAvgRating
        ? `Your portfolio avg rating: ${portfolioAvgRating}/5`
        : 'Portfolio comparison unavailable (insufficient internal reviews)'
    ];

    const referencePrice = newPrice || oldPrice || null;
    const estimatedCost = referencePrice ? Number((referencePrice * 0.72).toFixed(2)) : null;
    const targetProfit = referencePrice && estimatedCost
      ? Number((referencePrice - estimatedCost).toFixed(2))
      : null;

    const currentPlatform = detectPlatform(parsedUrl.hostname);
    const platformModel = [
      { platform: 'Amazon', feePercent: 18, benchmarkMultiplier: 1.02 },
      { platform: 'Flipkart', feePercent: 16, benchmarkMultiplier: 1.0 },
      { platform: 'Meesho', feePercent: 12, benchmarkMultiplier: 0.96 },
      { platform: 'Myntra', feePercent: 20, benchmarkMultiplier: 1.07 },
      { platform: 'Own Website', feePercent: 3, benchmarkMultiplier: 0.98 }
    ];

    const platformRows = platformModel.map((item) => {
      const marketSellingPrice = referencePrice
        ? Number((referencePrice * item.benchmarkMultiplier).toFixed(2))
        : null;

      const sameProfitSellingPrice = estimatedCost !== null && targetProfit !== null
        ? Number(((estimatedCost + targetProfit) / (1 - item.feePercent / 100)).toFixed(2))
        : null;

      const projectedProfitAtMarket = marketSellingPrice !== null && estimatedCost !== null
        ? Number((marketSellingPrice * (1 - item.feePercent / 100) - estimatedCost).toFixed(2))
        : null;

      const profitGap = sameProfitSellingPrice !== null && marketSellingPrice !== null
        ? Number((sameProfitSellingPrice - marketSellingPrice).toFixed(2))
        : null;

      const recommendation = profitGap === null
        ? 'Insufficient price data'
        : profitGap <= 0
          ? 'Meets same-profit target'
          : `Increase by ${profitGap}`;

      return {
        platform: item.platform,
        isCurrentPlatform: item.platform === currentPlatform,
        feePercent: item.feePercent,
        marketSellingPrice,
        sameProfitSellingPrice,
        projectedProfitAtMarket,
        recommendation
      };
    });

    res.json({
      success: true,
      data: {
        url: normalizedUrl,
        validated: true,
        source: {
          domain: parsedUrl.hostname,
          title,
          finalUrl,
          fetchMode,
          fetched: Boolean(html),
          warning: fetchWarning
        },
        reviewAnalysis: {
          rating,
          reviewCount,
          sentiment,
          summary: qualityBand === 'best'
            ? 'This listing shows strong review quality signals.'
            : qualityBand === 'worst'
              ? 'This listing shows weak review quality signals.'
              : 'This listing has mixed review quality signals.'
        },
        priceAnalysis: {
          oldPrice,
          newPrice,
          discountPercent,
          trend: discountPercent !== null ? 'discounted' : 'unknown'
        },
        discountEffect,
        marketPosition: {
          qualityBand,
          verdict: qualityBand === 'best' ? 'Best candidate' : qualityBand === 'worst' ? 'Worst-risk candidate' : 'Average candidate'
        },
        investmentRecommendation: {
          decision,
          score: investScore,
          reasons,
          recommendation: decision === 'invest'
            ? 'Invest: strong rating/price signals suggest upside potential.'
            : decision === 'do-not-invest'
              ? 'Do not invest now: risk signals are high. Improve product quality or pricing first.'
              : 'Watch closely: gather more review and pricing history before investing.'
        },
        platformComparison: {
          baseReferencePrice: referencePrice,
          estimatedCost,
          targetProfit,
          currentPlatform,
          rows: platformRows
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get reviews for a product
router.get('/:productId', verifyToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const reviews = await getProductReviews(req.params.productId);

    res.json({
      success: true,
      data: reviews.slice(0, parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get sentiment analysis
router.get('/:productId/sentiment', verifyToken, async (req, res) => {
  try {
    const productId = req.params.productId;
    const sellerId = req.user.userId;

    // Ensure requested product belongs to the authenticated seller
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, title')
      .eq('id', productId)
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const [reviews, entities, trendSentimentRows, sheetAnalysisRows] = await Promise.all([
      getProductReviews(productId).catch(() => []),
      supabaseAdmin
        .from('review_entities')
        .select('id, aspect, sentiment, mention_count')
        .eq('product_id', productId)
        .then(({ data }) => data || [])
        .catch(() => []),
      getReviewSentiment(productId).catch(() => []),
      supabaseAdmin
        .from('sheet_analysis_results')
        .select('id, title, description, insights, recommendations, created_at')
        .eq('user_id', sellerId)
        .eq('analysis_type', 'review_analysis')
        .order('created_at', { ascending: false })
        .limit(3)
        .then(({ data }) => data || [])
        .catch(() => [])
    ]);

    const reviewIds = reviews.map((review) => review.id).filter(Boolean);
    let reviewAnalysis = [];
    if (reviewIds.length > 0) {
      const { data: analysisRows } = await supabaseAdmin
        .from('review_analysis')
        .select('review_id, sentiment, confidence')
        .in('review_id', reviewIds);
      reviewAnalysis = analysisRows || [];
    }

    const sentimentByReviewId = new Map(reviewAnalysis.map((item) => [item.review_id, item.sentiment]));

    let positive = 0;
    let neutral = 0;
    let negative = 0;

    reviews.forEach((review) => {
      const sentiment = sentimentByReviewId.get(review.id) || sentimentFromRating(Number(review.rating || 0));
      if (sentiment === 'positive') positive += 1;
      else if (sentiment === 'negative') negative += 1;
      else neutral += 1;
    });

    // Fallback to aggregate table if no direct reviews are present
    if (reviews.length === 0 && trendSentimentRows.length > 0) {
      trendSentimentRows.forEach((row) => {
        positive += toNumber(row.positive_count);
        neutral += toNumber(row.neutral_count);
        negative += toNumber(row.negative_count);
      });
    }

    // Final fallback from sheet analysis if review tables are still empty
    if (reviews.length === 0 && positive + neutral + negative === 0 && sheetAnalysisRows.length > 0) {
      const latestSheet = sheetAnalysisRows[0];
      const parsedInsights = parseMaybeJson(latestSheet.insights) || {};
      const avgRatingFromSheet = toNumber(parsedInsights.avgRating, 4);

      const positiveShare = Math.max(0, Math.min(100, Math.round((avgRatingFromSheet / 5) * 70)));
      const negativeShare = Math.max(0, Math.min(100, Math.round(((5 - avgRatingFromSheet) / 5) * 50)));
      const neutralShare = Math.max(0, 100 - positiveShare - negativeShare);

      positive = positiveShare;
      neutral = neutralShare;
      negative = negativeShare;
    }

    const sentimentDistribution = [
      { name: 'Positive', value: positive },
      { name: 'Neutral', value: neutral },
      { name: 'Negative', value: negative }
    ];

    // Aspect-level aggregation from review_entities
    const aspectBucket = new Map();
    entities.forEach((entity) => {
      const aspectName = entity.aspect || 'General';
      if (!aspectBucket.has(aspectName)) {
        aspectBucket.set(aspectName, {
          id: aspectName,
          aspect: aspectName,
          weightedScore: 0,
          mentions: 0
        });
      }

      const aspect = aspectBucket.get(aspectName);
      const count = Math.max(1, toNumber(entity.mention_count, 1));
      const weight = entity.sentiment === 'positive' ? 5 : entity.sentiment === 'negative' ? 2 : 3;
      aspect.weightedScore += weight * count;
      aspect.mentions += count;
    });

    const aspects = Array.from(aspectBucket.values())
      .map((aspect) => ({
        id: aspect.id,
        aspect: aspect.aspect,
        score: Number((aspect.weightedScore / Math.max(1, aspect.mentions)).toFixed(1)),
        review_count: aspect.mentions
      }))
      .sort((a, b) => b.review_count - a.review_count)
      .slice(0, 6);

    const avgRatingRaw = reviews.length > 0
      ? reviews.reduce((sum, review) => sum + toNumber(review.rating), 0) / reviews.length
      : toNumber((parseMaybeJson(sheetAnalysisRows[0]?.insights || null) || {}).avgRating, 0);

    const avgRating = Number(avgRatingRaw.toFixed(2));
    const totalReviews = reviews.length > 0
      ? reviews.length
      : Math.max(0, positive + neutral + negative);

    const insights = [];

    if (totalReviews > 0 && avgRating > 0) {
      insights.push({
        id: 'rating-overview',
        title: avgRating >= 4.2 ? 'Customer sentiment is strong' : 'Customer sentiment needs improvement',
        description: `Average rating is ${avgRating.toFixed(1)}/5 from ${totalReviews} review signals.`,
        urgency_level: avgRating >= 4.2 ? 'low' : avgRating >= 3.5 ? 'medium' : 'high',
        type: 'review_analysis'
      });
    }

    if (aspects.length > 0) {
      const weakestAspect = [...aspects].sort((a, b) => a.score - b.score)[0];
      const strongestAspect = [...aspects].sort((a, b) => b.score - a.score)[0];

      if (weakestAspect) {
        insights.push({
          id: 'weak-aspect',
          title: `Improve ${weakestAspect.aspect}`,
          description: `${weakestAspect.aspect} has the lowest aspect score (${weakestAspect.score}/5). Prioritize fixes and monitor incoming feedback.`,
          urgency_level: weakestAspect.score < 3.5 ? 'high' : 'medium',
          type: 'product_improvement'
        });
      }

      if (strongestAspect) {
        insights.push({
          id: 'strong-aspect',
          title: `Highlight ${strongestAspect.aspect} in marketing`,
          description: `${strongestAspect.aspect} is your strongest aspect (${strongestAspect.score}/5). Use it in product messaging and ad creatives.`,
          urgency_level: 'medium',
          type: 'marketing_optimization'
        });
      }
    }

    // Include latest sheet recommendations as related insights when available
    const latestSheet = sheetAnalysisRows[0];
    const sheetRecommendations = Array.isArray(parseMaybeJson(latestSheet?.recommendations))
      ? parseMaybeJson(latestSheet.recommendations)
      : [];

    sheetRecommendations.slice(0, 2).forEach((recommendation, index) => {
      insights.push({
        id: `sheet-rec-${index + 1}`,
        title: latestSheet?.title || 'Sheet-based review recommendation',
        description: recommendation,
        urgency_level: 'medium',
        type: 'review_analysis'
      });
    });

    res.json({
      success: true,
      data: {
        sentiment: sentimentDistribution,
        aspects,
        insights: insights.slice(0, 4),
        total_reviews: totalReviews,
        avg_rating: avgRating
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get entity-level sentiment
router.get('/:productId/entity-sentiment', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('review_entities')
      .select('*')
      .eq('product_id', req.params.productId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Aggregate by aspect
    const aspectSentiment = {};
    data?.forEach(entity => {
      if (!aspectSentiment[entity.aspect]) {
        aspectSentiment[entity.aspect] = {
          positive: 0,
          neutral: 0,
          negative: 0,
          total: 0
        };
      }
      aspectSentiment[entity.aspect][entity.sentiment] += 1;
      aspectSentiment[entity.aspect].total += 1;
    });

    res.json({
      success: true,
      data: aspectSentiment
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add review (for scraper/agent)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      productId,
      source,
      sourceId,
      rating,
      text,
      author,
      verified,
      platform
    } = req.body;

    if (!productId || !rating || !text) {
      return res.status(400).json({
        success: false,
        error: 'Product ID, rating, and text required'
      });
    }

    const reviewData = {
      product_id: productId,
      seller_id: req.user.userId,
      source,
      source_id: sourceId,
      rating,
      text,
      author,
      verified: verified || false,
      platform,
      created_at: new Date().toISOString()
    };

    const review = await insertReview(reviewData);

    // TODO: Call sentiment analysis API here
    // For now, assign random sentiment for demo
    const sentiments = ['positive', 'neutral', 'negative'];
    const sentiment = sentiments[Math.floor(Math.random() * 3)];

    await supabase
      .from('review_analysis')
      .insert([{
        review_id: review.id,
        sentiment,
        confidence: Math.random() * 0.4 + 0.6
      }]);

    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('new-review', review);

    res.status(201).json({
      success: true,
      message: 'Review added',
      data: review
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get sentiment trend
router.get('/:productId/sentiment-trend', verifyToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(days));

    const { data, error } = await supabase
      .from('reviews')
      .select(`
        id,
        rating,
        created_at,
        review_analysis(sentiment, confidence)
      `)
      .eq('product_id', req.params.productId)
      .gte('created_at', dateFrom.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Aggregate by week
    const trendData = {};
    data?.forEach(review => {
      const date = new Date(review.created_at);
      const week = `Week ${Math.ceil(date.getDate() / 7)}`;

      if (!trendData[week]) {
        trendData[week] = { positive: 0, neutral: 0, negative: 0, total: 0 };
      }

      const sentiment = review.review_analysis?.[0]?.sentiment || 'neutral';
      trendData[week][sentiment] += 1;
      trendData[week].total += 1;
    });

    res.json({
      success: true,
      data: trendData
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;