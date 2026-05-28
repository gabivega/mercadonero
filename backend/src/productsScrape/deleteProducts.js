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

async function cleanDuplicateProducts() {
  try {
    console.log('⏳ Conectando a la base de datos...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB para la limpieza...");

    console.log('🔍 Analizando duplicados por título...');

    // 1. Usamos agregación para encontrar los títulos repetidos
    const duplicates = await Product.aggregate([
      {
        // Agrupamos por el campo "title"
        $group: {
          _id: "$title",
          // Guardamos todos los IDs que comparten ese título
          ids: { $push: "$_id" },
          // Contamos cuántas veces aparece
          count: { $sum: 1 }
        }
      },
      {
        // Filtramos y nos quedamos solo con los que aparecen 2 o más veces
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length === 0) {
      console.log('✨ ¡Buenas noticias! No se encontraron productos duplicados por título.');
      process.exit(0);
    }

    // 2. Armamos la lista de IDs que vamos a borrar
    // De cada grupo de duplicados, dejamos el primer ID intacto y guardamos los demás para eliminar
    const idsToDelete = [];
    let totalDuplicatedCount = 0;

    duplicates.forEach(group => {
      // El primer elemento (index 0) se salva, el resto va a la lista de eliminación
      const groupDuplicates = group.ids.slice(1); 
      idsToDelete.push(...groupDuplicates);
      totalDuplicatedCount += groupDuplicates.length;
    });

    console.log(`⚠️ Se encontraron ${duplicates.length} títulos repetidos.`);
    console.log(`👉 Esto equivale a ${totalDuplicatedCount} productos clones que serán eliminados.`);

    // 3. Eliminación masiva de los IDs seleccionados
    const result = await Product.deleteMany({ _id: { $in: idsToDelete } });

    console.log(`🧹 ¡Limpieza completada con éxito!`);
    console.log(`🗑️  Se eliminaron exactamente ${result.deletedCount} productos duplicados.`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error crítico durante la ejecución del script:', error);
    process.exit(1);
  }
}


// cleanEmptyImageProducts();
cleanDuplicateProducts();