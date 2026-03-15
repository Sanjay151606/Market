import { useState, useEffect, useMemo } from 'react';
import { Loader } from 'lucide-react';
import api from '../utils/api';
import './CompetitorRadar.css';

const CompetitorRadar = () => {
  const [sortBy, setSortBy] = useState('priceChange');
  const [filterEvent, setFilterEvent] = useState('all');
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [products, setProducts] = useState([]);
  const [sheetPricingRows, setSheetPricingRows] = useState([]);
  const [aiEstimate, setAiEstimate] = useState(null);

  const selectedProductData = useMemo(
    () => products.find((product) => product.id === selectedProduct) || null,
    [products, selectedProduct]
  );

  const filteredCompetitors = useMemo(() => {
    let data = [...competitors];

    if (filterEvent !== 'all') {
      data = data.filter((comp) => comp.event_type === filterEvent);
    }

    data.sort((a, b) => {
      if (sortBy === 'priceChange') {
        return Math.abs(b.price_change || 0) - Math.abs(a.price_change || 0);
      }
      if (sortBy === 'ratingChange') {
        return Math.abs(b.rating_change || 0) - Math.abs(a.rating_change || 0);
      }
      return new Date(b.last_updated || 0) - new Date(a.last_updated || 0);
    });

    return data;
  }, [competitors, filterEvent, sortBy]);

  const tableModel = useMemo(() => {
    const formatPrice = (value) => {
      const numeric = Number(value || 0);
      return numeric > 0 ? `₹${numeric.toFixed(0)}` : 'N/A';
    };

    if (sheetPricingRows.length > 0) {
      return {
        headers: ['Product Name', 'Our Company', 'Amazon', 'Flipkart', 'Ecart', 'Local Shops', 'Sales Ratio', 'Recommendations'],
        rows: sheetPricingRows.map((row) => {
          const market = Number(row.marketPrice || 0);
          const amazon = market;
          const flipkart = market > 0 ? market * 1.01 : 0;
          const ecart = market > 0 ? market * 0.99 : 0;
          const localShops = market > 0 ? market * 1.02 : 0;
          return [
            row.product || 'Product',
            formatPrice(row.currentPrice),
            formatPrice(amazon),
            formatPrice(flipkart),
            formatPrice(ecart),
            formatPrice(localShops),
            `${Number(row.expectedMarginPct || 0).toFixed(1)}% margin`,
            row.action || `Recommended: ₹${Number(row.recommendedPrice || 0).toFixed(0)}`
          ];
        })
      };
    }

    if (products.length > 0 && selectedProductData) {
      const yourPrice = Number(selectedProductData.current_price || 0);

      const findByPlatform = (platformName) => {
        const match = filteredCompetitors.find((item) =>
          (item.platform || '').toLowerCase().includes(platformName.toLowerCase())
        );
        return match ? Number(match.current_price || 0) : 0;
      };

      const amazon = Number(aiEstimate?.amazon || 0) || findByPlatform('amazon');
      const flipkart = Number(aiEstimate?.flipkart || 0) || findByPlatform('flipkart');
      const ecart = Number(aiEstimate?.ecart || 0) || findByPlatform('ecart') || findByPlatform('ekart');
      const localShops = Number(aiEstimate?.localShops || 0);

      const recommendation = aiEstimate?.recommendation || 'Collect more competitor prices for stronger recommendation';
      const salesRatio = aiEstimate?.salesRatio || 'N/A';

      return {
        headers: ['Product Name', 'Our Company', 'Amazon', 'Flipkart', 'Ecart', 'Local Shops', 'Sales Ratio', 'Recommendations'],
        rows: [
          [
            selectedProductData.title || 'Selected Product',
            formatPrice(aiEstimate?.ourPrice || yourPrice),
            formatPrice(amazon),
            formatPrice(flipkart),
            formatPrice(ecart),
            formatPrice(localShops),
            salesRatio,
            recommendation
          ]
        ]
      };
    }

    return null;
  }, [products.length, selectedProductData, filteredCompetitors, sheetPricingRows, aiEstimate]);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchCompetitorData();
    }
  }, [selectedProduct]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const [res, sheetAnalysisRes] = await Promise.all([
        api.getProducts(),
        api.getSheetAnalysis().catch(() => ({ analyses: [] }))
      ]);
      setProducts(res.data || []);

      const latestPricingAnalysis = (sheetAnalysisRes.analyses || []).find((analysis) => {
        if (analysis.analysis_type !== 'pricing_analysis') return false;
        if (!analysis.insights) return false;
        let insights = analysis.insights;
        if (typeof insights === 'string') {
          try {
            insights = JSON.parse(insights);
          } catch {
            insights = null;
          }
        }
        return Array.isArray(insights?.productComparisons) && insights.productComparisons.length > 0;
      });

      if (latestPricingAnalysis?.insights) {
        let parsed = latestPricingAnalysis.insights;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            parsed = null;
          }
        }
        setSheetPricingRows(parsed?.productComparisons || []);
      } else {
        setSheetPricingRows([]);
      }
      setAiEstimate(null);

      if (res.data?.length > 0) {
        setSelectedProduct(res.data[0].id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
      setSheetPricingRows([]);
      setLoading(false);
    }
  };

  const fetchCompetitorData = async () => {
    const withTimeout = (promise, timeoutMs = 8000) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        })
      ]);
    };

    try {
      setLoading(true);
      const [res] = await Promise.all([
        withTimeout(api.getCompetitors(selectedProduct), 8000)
      ]);
      setCompetitors(res?.data || []);

      const selected = products.find((item) => item.id === selectedProduct);
      if (selected?.title) {
        const estimateRes = await withTimeout(
          api.estimateCompetitorPrices(selected.title, Number(selected.current_price || 0)),
          12000
        ).catch(() => null);
        setAiEstimate(estimateRes?.data || null);
      } else {
        setAiEstimate(null);
      }
    } catch (error) {
      console.error('Error fetching competitor data:', error);
      setCompetitors([]);
      setAiEstimate(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="competitor-radar">
        <div className="state-card">
          <Loader className="animate-spin" size={40} />
          <p>Loading competitor data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="competitor-radar">
      <div className="page-header">
        <h1>Competitor Radar</h1>
        <p>Track competitor activities and market changes</p>
      </div>

      {products.length > 0 && (
        <>
          <div className="controls">
            <div className="control-group">
              <label>Product</label>
              <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                {products.map(product => (
                  <option key={product.id} value={product.id}>{product.title}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label>Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="priceChange">Price Change</option>
                <option value="ratingChange">Rating Change</option>
                <option value="lastUpdated">Last Updated</option>
              </select>
            </div>
            <div className="control-group">
              <label>Filter Events</label>
              <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}>
                <option value="all">All Events</option>
                <option value="price">Price Changes</option>
                <option value="bundle">Bundle Launches</option>
                <option value="rating">Rating Changes</option>
              </select>
            </div>
          </div>

        </>
      )}

      {!tableModel && (
        <div className="state-card compact">
          <p>No sheet-based competitor analysis yet. Run analysis in Settings, then refresh this page.</p>
        </div>
      )}

      {tableModel && (
        <div className="competitor-table-card">
          <div className="competitor-table simple-table">
            <table>
              <thead>
                <tr>
                  {tableModel.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableModel.rows.map((row, rowIndex) => (
                  <tr key={`cmp-row-${rowIndex}`}>
                    {row.map((value, colIndex) => (
                      <td key={`cmp-cell-${rowIndex}-${colIndex}`}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompetitorRadar;
