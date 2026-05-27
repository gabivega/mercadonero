import mongoose from 'mongoose';
import dotenv from 'dotenv';
// Asegurate de importar tu modelo de Producto correctamente
import Product from '../models/Product.js'; 

dotenv.config();

async function cleanEmptyImageProducts() {
  try {
    console.log('⏳ Conectando a la base de datos...');
     await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB for seeding...");

    // 1. Contamos cuántos productos están afectados antes de borrar
    const queryAffected = { images: { $size: 0 } };
    const count = await Product.countDocuments(queryAffected);

    if (count === 0) {
      console.log('✨ ¡Buenas noticias! No se encontraron productos con el array de imágenes vacío.');
      process.exit(0);
    }

    console.log(`⚠️ Se encontraron ${count} productos sin imágenes que serán eliminados.`);

    // 2. Eliminamos masivamente los productos afectados
    const result = await Product.deleteMany(queryAffected);
    
    console.log(`💥 ¡Limpieza exitosa! Se eliminaron ${result.deletedCount} productos de la base de datos.`);

  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error);
  } finally {
    // Cerramos la conexión de forma segura
    await mongoose.disconnect();
    console.log('🔌 Conexión a MongoDB cerrada.');
    process.exit(0);
  }
}

cleanEmptyImageProducts();