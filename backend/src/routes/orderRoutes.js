import express from 'express';
const router = express.Router();
import { createOrder, getMyOrders, getMyCollateralBreakdown, markAsPaid, getOrderById, updateOrder, cancelOrder, vendorConfirmsRefund, buyerConfirmsRefundReceived, requestAdminRelease, retryCollateral, cancelCollateralHold, prepareEscrowFunding, updateOrderPaymentChain, confirmEscrowFunding, getEscrowStatus, cancelCryptoOrder, rollbackCryptoOrder, openDispute, uploadPaymentProof, buyerRequestEscrowRelease } from '../controllers/orderController.js';
import verifyAuth from '../middleware/verifyAuth.js';
import attachUser from '../middleware/attachUser.js';

router.post('/create', verifyAuth, attachUser, createOrder);
router.get('/my-orders', verifyAuth, attachUser, getMyOrders);
// Desglose de colateral retenido del vendedor (orden por orden, fuente on-chain)
router.get('/my-collateral', verifyAuth, attachUser, getMyCollateralBreakdown);
router.patch('/mark-as-paid/:orderId', verifyAuth, attachUser, markAsPaid);
router.get('/:orderId', verifyAuth, attachUser, getOrderById);
router.patch('/:orderId', verifyAuth, attachUser, updateOrder);

// Cancelación (comprador)
router.patch('/:orderId/cancel', verifyAuth, attachUser, cancelOrder);
// Cancelación con escrow crypto (comprador/vendedor) - devuelve USDT al comprador
router.patch('/:orderId/cancel-crypto', verifyAuth, attachUser, cancelCryptoOrder);
// Ver estado on-chain del escrow de una orden crypto
router.get('/:orderId/escrow-status', verifyAuth, attachUser, getEscrowStatus);
// Confirmar fondeo del escrow (comprador reporta txHash, backend verifica on-chain)
// Rollback de orden crypto provisional (comprador cerró el modal sin fondear)
router.delete('/:orderId/escrow/rollback', verifyAuth, attachUser, rollbackCryptoOrder);
// Preparar fondeo del escrow: valida saldo USDT + entrega gas drip (BNB) + devuelve token.
router.post('/:orderId/escrow/prepare-funding', verifyAuth, attachUser, prepareEscrowFunding);
// Cambiar la red de pago (USDT/BSC, USDC/Base, USDXM/Polygon) de una orden
// crypto provisional aún no fondeada (el comprador elige la red en el modal).
router.patch('/:orderId/payment-chain', verifyAuth, attachUser, updateOrderPaymentChain);
router.post('/:orderId/escrow/fund', verifyAuth, attachUser, confirmEscrowFunding);
// Colateral en espera: vendedor deposita y activa la orden / comprador no espera más
router.post('/:orderId/retry-collateral', verifyAuth, attachUser, retryCollateral);
router.patch('/:orderId/cancel-collateral-hold', verifyAuth, attachUser, cancelCollateralHold);
// Reembolso: vendedor confirma que reembolsó
router.patch('/:orderId/vendor-confirms-refund', verifyAuth, attachUser, vendorConfirmsRefund);
// Reembolso: comprador confirma que recibió el reintegro
router.patch('/:orderId/buyer-confirms-refund-received', verifyAuth, attachUser, buyerConfirmsRefundReceived);
// Vendedor solicita liberación manual al admin
router.patch('/:orderId/request-admin-release', verifyAuth, attachUser, requestAdminRelease);
// Comprador abre una disputa cuando el pedido va en camino pero llegó mal
router.post('/:orderId/dispute', verifyAuth, attachUser, openDispute);
// Comprador adjunta el comprobante de su transferencia ante una disputa de
// pago no recibido (recibe una URL ya subida a Cloudinary desde el front).
router.patch('/:orderId/upload-proof', verifyAuth, attachUser, uploadPaymentProof);
// Comprador solicita la liberación del escrow al admin tras el plazo de
// inactividad (ej: recibió el producto y no confirmó en la plataforma).
router.post('/:orderId/escrow/request-release', verifyAuth, attachUser, buyerRequestEscrowRelease);

export default router;