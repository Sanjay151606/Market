import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyToken } from '../utils/auth.js';
import { getSellerProducts, createProduct, updateProduct } from '../utils/db.js';

const router = express.Router();

// Get all products for a seller
router.get('/', verifyToken, async (req, res) => {
  try {
    const products = await getSellerProducts(req.user.userId);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single product
router.get('/:productId', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', req.params.productId)
      .eq('seller_id', req.user.userId)
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Product not found' });
  }
});

// Create new product
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, asin, fsn, category, currentPrice, imageUrl } = req.body;

    if (!title || (!asin && !fsn)) {
      return res.status(400).json({ success: false, error: 'Title and ASIN/FSN required' });
    }

    const productData = {
      seller_id: req.user.userId,
      title,
      asin,
      fsn,
      category,
      current_price: currentPrice,
      image_url: imageUrl,
      created_at: new Date().toISOString()
    };

    const product = await createProduct(productData);

    // Emit real-time update
    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('product-added', product);

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      data: product
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update product
router.put('/:productId', verifyToken, async (req, res) => {
  try {
    const { title, category, imageUrl } = req.body;

    const updates = {};
    if (title) updates.title = title;
    if (category) updates.category = category;
    if (imageUrl) updates.image_url = imageUrl;
    updates.updated_at = new Date().toISOString();

    const product = await updateProduct(req.params.productId, updates);

    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('product-updated', product);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete product
router.delete('/:productId', verifyToken, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', req.params.productId)
      .eq('seller_id', req.user.userId);

    if (error) throw error;

    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('product-deleted', req.params.productId);

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;