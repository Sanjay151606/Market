import supabase from './supabaseClient.js';

class AnalysisEngine {
  /**
   * Global INR Currency Formatter
   */
  static formatINR(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Analyze business data from Google Sheets
   */
  static async analyzeBusinessData(userId, connectionId, sheetData) {
    try {
      const analyses = [];

      // Parse sheet data (first row is headers)
      const headers = sheetData[0];
      const rows = sheetData.slice(1);

      if (rows.length === 0) {
        return {
          analyses: [],
          message: 'No data to analyze yet. Start entering business data in your sheet.'
        };
      }

      // Create column mapping
      const columnMap = {};
      headers.forEach((header, index) => {
        columnMap[header.toLowerCase()] = index;
      });

      // Extract data columns
      const salesData = this.extractSalesData(rows, columnMap);
      const inventoryData = this.extractInventoryData(rows, columnMap);
      const reviewData = this.extractReviewData(rows, columnMap);

      // Generate analyses
      if (salesData.length > 0) {
        const salesAnalysis = await this.generateSalesAnalysis(salesData);
        analyses.push(salesAnalysis);
      }

      if (inventoryData.length > 0) {
        const inventoryAnalysis = await this.generateInventoryAnalysis(inventoryData);
        analyses.push(inventoryAnalysis);
      }

      if (reviewData.length > 0) {
        const reviewAnalysis = await this.generateReviewAnalysis(reviewData);
        analyses.push(reviewAnalysis);
      }

      // Generate pricing recommendations
      const pricingAnalysis = await this.generatePricingAnalysis(salesData);
      analyses.push(pricingAnalysis);

      // Save analyses to database
      for (const analysis of analyses) {
        await supabase.from('sheet_analysis_results').insert({
          user_id: userId,
          connection_id: connectionId,
          analysis_type: analysis.type,
          title: analysis.title,
          description: analysis.description,
          insights: analysis.insights,
          recommendations: analysis.recommendations,
          metrics: analysis.metrics,
          confidence_score: analysis.confidence
        });
      }

      return { analyses, success: true };
    } catch (error) {
      console.error('Error analyzing business data:', error);
      throw error;
    }
  }

  /**
   * Extract sales data from rows
   */
  static extractSalesData(rows, columnMap) {
    return rows.map(row => ({
      date: row[columnMap['date']] || new Date().toISOString(),
      product: row[columnMap['product name']],
      sku: row[columnMap['sku']] || '',
      unitsSold: parseInt(row[columnMap['units sold']]) || 0,
      salePrice: parseFloat(row[columnMap['selling price']]) || parseFloat(row[columnMap['sale price']]) || 0,
      totalRevenue: parseFloat(row[columnMap['total revenue']]) || 0,
      customerCount: parseInt(row[columnMap['customer count']]) || 0,
      competitorPrice: parseFloat(row[columnMap['competitor price']]) || 0,
      purchasePrice: parseFloat(row[columnMap['purchase price']]) || 0,
      avgRating: parseFloat(row[columnMap['average rating']]) || 0
    })).filter(d => d.product && d.salePrice > 0);
  }

  /**
   * Extract inventory data from rows
   */
  static extractInventoryData(rows, columnMap) {
    return rows.map(row => ({
      product: row[columnMap['product name']],
      inventory: parseInt(row[columnMap['inventory level']]) || parseInt(row[columnMap['stock qty']]) || 0,
      reorderStatus: row[columnMap['reorder status']] || 'Normal',
      purchasePrice: parseFloat(row[columnMap['purchase price']]) || 0,
      sellingPrice: parseFloat(row[columnMap['selling price']]) || parseFloat(row[columnMap['sale price']]) || 0,
      lastRestock: row[columnMap['last restock']] || null,
    })).filter(d => d.product);
  }

  /**
   * Extract review data from rows
   */
  static extractReviewData(rows, columnMap) {
    return rows.map(row => ({
      product: row[columnMap['product name']],
      reviews: parseInt(row[columnMap['customer reviews']]) || 0,
      avgRating: parseFloat(row[columnMap['average rating']]) || 0,
    })).filter(d => d.product);
  }

  /**
   * Generate sales trend analysis
   */
  static async generateSalesAnalysis(salesData) {
    const totalRevenue = salesData.reduce((sum, d) => sum + d.totalRevenue, 0);
    const avgOrderValue = totalRevenue / salesData.length;
    const topProduct = salesData.reduce((max, d) => d.totalRevenue > max.totalRevenue ? d : max);

    const trend = salesData.length > 2
      ? (salesData[salesData.length - 1].totalRevenue > salesData[0].totalRevenue ? 'up' : 'down')
      : 'stable';

    return {
      type: 'sales_trend',
      title: 'Sales Performance Analysis',
      description: 'Analysis of your sales trends and performance',
      insights: {
        totalRevenue,
        avgOrderValue,
        topProduct: topProduct.product,
        trend,
        dataPoints: salesData.length
      },
      recommendations: [
        trend === 'down' ? 'Focus on marketing. Your sales are declining.' : 'Great momentum! Continue current strategy.',
        `Your top product is ${topProduct.product}. Consider bundling or promoting similar items.`,
        `Average order value is ${this.formatINR(avgOrderValue)}. Consider upselling strategies.`
      ],
      metrics: {
        totalRevenue,
        avgOrderValue,
        orderCount: salesData.length,
        revenue_opportunity: trend === 'down' ? totalRevenue * 0.15 : 0
      },
      confidence: 0.85
    };
  }

  /**
   * Generate inventory analysis
   */
  static async generateInventoryAnalysis(inventoryData) {
    const lowStockThreshold = 10;
    const lowStockItems = inventoryData.filter(d => d.inventory < lowStockThreshold);
    const totalStock = inventoryData.reduce((sum, d) => sum + d.inventory, 0);
    
    // Calculate potential profit based on new columns
    let potentialRevenue = 0;
    let potentialProfit = 0;
    inventoryData.forEach(item => {
      const stock = item.inventory || 0;
      const sp = item.sellingPrice || 0;
      const pp = item.purchasePrice || 0;
      potentialRevenue += stock * sp;
      if (sp > pp) {
        potentialProfit += stock * (sp - pp);
      }
    });

    return {
      type: 'inventory_alert',
      title: 'Inventory Status Report',
      description: 'Current inventory levels and profit alerts',
      insights: {
        totalItems: inventoryData.length,
        totalStock,
        avgStockLevel: (totalStock / inventoryData.length).toFixed(2),
        lowStockCount: lowStockItems.length,
        needReorder: lowStockItems.length > 0,
        potentialProfit: potentialProfit,
        potentialRevenue: potentialRevenue
      },
      recommendations: [
        lowStockItems.length > 0
          ? `⚠️ ${lowStockItems.length} items running low. Reorder soon: ${lowStockItems.map(i => i.product).join(', ')}`
          : '✓ All inventory levels are healthy.',
        'Monitor stock levels weekly to prevent stockouts.',
        potentialProfit > 0 ? `You have an estimated potential profit of ${this.formatINR(potentialProfit)} locked in current inventory.` : 'Consider reviewing pricing strategies to improve profit margins.'
      ],
      metrics: {
        totalStock,
        lowStockCount: lowStockItems.length,
        avgLevel: (totalStock / inventoryData.length)
      },
      confidence: 0.9
    };
  }

  /**
   * Generate review and rating analysis
   */
  static async generateReviewAnalysis(reviewData) {
    const avgRating = (reviewData.reduce((sum, d) => sum + d.avgRating, 0) / reviewData.length).toFixed(2);
    const totalReviews = reviewData.reduce((sum, d) => sum + d.reviews, 0);
    const lowRatedProducts = reviewData.filter(d => d.avgRating < 4);

    return {
      type: 'review_analysis',
      title: 'Customer Review & Rating Analysis',
      description: 'Analysis of customer feedback and ratings',
      insights: {
        avgRating,
        totalReviews,
        productsAnalyzed: reviewData.length,
        lowRatedCount: lowRatedProducts.length,
        sentiment: avgRating >= 4.2 ? 'Very Positive' : avgRating >= 3.5 ? 'Positive' : 'Needs Improvement'
      },
      recommendations: [
        `Your average rating is ${avgRating}/5. ${avgRating >= 4 ? '✓ Strong customer satisfaction!' : '⚠️ Focus on product quality and customer service.'}`,
        lowRatedProducts.length > 0 ? `Address issues with: ${lowRatedProducts.map(p => p.product).join(', ')}` : 'Maintain current quality standards.',
        'Monitor reviews daily and respond to customer feedback promptly.'
      ],
      metrics: {
        avgRating,
        totalReviews,
        productsAnalyzed: reviewData.length
      },
      confidence: 0.88
    };
  }

  /**
   * Generate pricing optimization recommendations
   */
  static async generatePricingAnalysis(salesData) {
    if (salesData.length === 0) {
      return {
        type: 'pricing_analysis',
        title: 'Pricing Analysis',
        description: 'No data available for pricing analysis',
        insights: {},
        recommendations: ['Start tracking sales data to get pricing recommendations'],
        metrics: {},
        confidence: 0
      };
    }

    const byProduct = new Map();
    for (const row of salesData) {
      const key = row.product;
      const existing = byProduct.get(key) || {
        product: row.product,
        sku: row.sku || '-',
        ownPrices: [],
        competitorPrices: [],
        purchasePrices: [],
        unitsSold: [],
        ratings: []
      };

      existing.ownPrices.push(row.salePrice);
      if (row.competitorPrice > 0) existing.competitorPrices.push(row.competitorPrice);
      if (row.purchasePrice > 0) existing.purchasePrices.push(row.purchasePrice);
      existing.unitsSold.push(row.unitsSold || 0);
      if (row.avgRating > 0) existing.ratings.push(row.avgRating);
      byProduct.set(key, existing);
    }

    const productComparisons = Array.from(byProduct.values()).map((item) => {
      const avgOwnPrice = item.ownPrices.reduce((sum, value) => sum + value, 0) / item.ownPrices.length;
      const avgMarketPrice = item.competitorPrices.length > 0
        ? item.competitorPrices.reduce((sum, value) => sum + value, 0) / item.competitorPrices.length
        : avgOwnPrice;
      const avgPurchasePrice = item.purchasePrices.length > 0
        ? item.purchasePrices.reduce((sum, value) => sum + value, 0) / item.purchasePrices.length
        : avgOwnPrice * 0.75;

      const avgUnitsSold = item.unitsSold.reduce((sum, value) => sum + value, 0) / item.unitsSold.length;
      const avgRating = item.ratings.length > 0
        ? item.ratings.reduce((sum, value) => sum + value, 0) / item.ratings.length
        : 4;

      const minProfitPrice = avgPurchasePrice * 1.2;
      const ratingAdjustment = avgRating >= 4.5 ? 0.03 : avgRating < 3.8 ? -0.04 : 0;
      const demandAdjustment = avgUnitsSold >= 20 ? 0.03 : avgUnitsSold <= 5 ? -0.02 : 0;

      const demandWeightedMarket = avgMarketPrice * (1 + ratingAdjustment + demandAdjustment);
      const marketCap = item.competitorPrices.length > 0 ? avgMarketPrice * 1.08 : avgOwnPrice * 1.12;
      const recommendedPrice = Math.max(minProfitPrice, Math.min(demandWeightedMarket, marketCap));

      const priceGapPct = avgOwnPrice > 0 ? ((avgOwnPrice - avgMarketPrice) / avgOwnPrice) * 100 : 0;
      const expectedMarginPct = recommendedPrice > 0
        ? ((recommendedPrice - avgPurchasePrice) / recommendedPrice) * 100
        : 0;

      let action = 'Keep current pricing';
      if (recommendedPrice > avgOwnPrice * 1.03) action = 'Increase price';
      else if (recommendedPrice < avgOwnPrice * 0.97) action = 'Reduce price';

      return {
        product: item.product,
        sku: item.sku,
        currentPrice: Number(avgOwnPrice.toFixed(2)),
        marketPrice: Number(avgMarketPrice.toFixed(2)),
        recommendedPrice: Number(recommendedPrice.toFixed(2)),
        purchasePrice: Number(avgPurchasePrice.toFixed(2)),
        priceGapPct: Number(priceGapPct.toFixed(2)),
        expectedMarginPct: Number(expectedMarginPct.toFixed(2)),
        avgUnitsSold: Number(avgUnitsSold.toFixed(2)),
        avgRating: Number(avgRating.toFixed(2)),
        action
      };
    });

    const increases = productComparisons.filter((p) => p.action === 'Increase price').length;
    const reductions = productComparisons.filter((p) => p.action === 'Reduce price').length;
    const avgUpliftPct = productComparisons.length > 0
      ? productComparisons.reduce((sum, p) => {
          if (!p.currentPrice) return sum;
          return sum + (((p.recommendedPrice - p.currentPrice) / p.currentPrice) * 100);
        }, 0) / productComparisons.length
      : 0;

    const highestOpportunity = productComparisons
      .slice()
      .sort((a, b) => (b.recommendedPrice - b.currentPrice) - (a.recommendedPrice - a.currentPrice))[0];

    return {
      type: 'pricing_analysis',
      title: 'Product-wise Price Comparison & Recommended Sell Price',
      description: 'Compared sheet prices with market/competitor prices and generated recommended selling price for each product.',
      insights: {
        productComparisons,
        summary: {
          productsAnalyzed: productComparisons.length,
          priceIncreaseCandidates: increases,
          priceReductionCandidates: reductions,
          avgRecommendedChangePct: Number(avgUpliftPct.toFixed(2))
        }
      },
      recommendations: [
        `Products analyzed: ${productComparisons.length}. Increase candidates: ${increases}, reduction candidates: ${reductions}.`,
        highestOpportunity
          ? `Highest upside product: ${highestOpportunity.product}. Current ${this.formatINR(highestOpportunity.currentPrice)} → recommended ${this.formatINR(highestOpportunity.recommendedPrice)}.`
          : 'Add more product rows to get stronger recommendations.',
        'Refresh competitor/market prices regularly in your sheet for better recommendation accuracy.'
      ],
      metrics: {
        productsAnalyzed: productComparisons.length,
        avgRecommendedChangePct: Number(avgUpliftPct.toFixed(2)),
        increaseCandidates: increases,
        reductionCandidates: reductions
      },
      confidence: 0.86
    };
  }
}

export default AnalysisEngine;
