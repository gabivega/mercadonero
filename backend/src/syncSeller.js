import mongoose from 'mongoose';
import 'dotenv/config'; // Asegúrate de tener dotenv instalado

// --- MODELOS (Asegúrate de que los nombres coincidan con tu proyecto) ---
const productSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sellerName: String,
    sellerIsVerified: { type: Boolean, default: false }
});

const userSchema = new mongoose.Schema({
    username: String,
    isVerified: { type: Boolean, default: false },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
});

const Product = mongoose.model('Product', productSchema);
const User = mongoose.model('User', userSchema);

// --- CONFIGURACIÓN DE CONEXIÓN ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tu_base_de_datos';

async function migrate() {
    try {
        console.log('🚀 Iniciando migración de Mercado Nero...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a MongoDB');

        const products = await Product.find({});
        console.log(`📦 Encontrados ${products.length} productos para procesar.`);

        // Usamos un Map para evitar buscar al mismo usuario mil veces en la DB
        const userCache = new Map();
        // Set para llevar registro de qué productos tiene cada usuario
        const userProductsMap = new Map();

        for (const product of products) {
            let user = userCache.get(product.seller.toString());

            if (!user) {
                user = await User.findById(product.seller);
                if (user) userCache.set(product.seller.toString(), user);
            }

            if (user) {
                // 1. Actualizamos el producto con la info del vendedor
                // Aquí decidimos: true a todos, o user.isVerified
                product.sellerName = user.username || "Vendedor Nero";
                product.sellerIsVerified = true; // Forzamos true como pediste

                await product.save();

                // 2. Preparamos la relación inversa (User -> Products)
                const sellerId = user._id.toString();
                if (!userProductsMap.has(sellerId)) {
                    userProductsMap.set(sellerId, []);
                }
                userProductsMap.get(sellerId).push(product._id);
            } else {
                console.warn(`⚠️ Producto ${product._id} tiene un seller inexistente: ${product.seller}`);
            }
        }

        console.log('🔄 Sincronizando arrays de productos en Usuarios...');

        // 3. Actualizamos los usuarios con sus IDs de productos encontrados
        for (const [userId, productIds] of userProductsMap.entries()) {
            await User.findByIdAndUpdate(userId, {
                $set: { products: productIds, isVerified: true } // También verificamos al usuario
            });
        }

        console.log('✨ Migración completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    }
}

migrate();