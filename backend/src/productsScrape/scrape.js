import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Product from "../models/Product.js";
import fs from "fs";

dotenv.config();

const productsData = JSON.parse(
  fs.readFileSync("./src/productsScrape/mercadolibre_productos.json", "utf-8"),
);

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for seeding...");

    const sellerMap = {};

    // Creamos primero el usuario para productos sin vendedor
    const genericUser = await User.findOneAndUpdate(
      { username: "mercado-nero" },
      {
        name: "Mercado Nero",
        email: "info@mercadonero.com",
        privyDid: "did:privy:generic-seller",
        isSeller: true,
        username: "mercado-nero",
        shop: {
          active: true,
          name: "MERCADO NERO",
          description: "Productos seleccionados",
        },
      },
      { upsert: true, new: true },
    );

    // 2. Mapear vendedores existentes
    const uniqueSellers = [
      ...new Set(
        productsData
          .map((p) => p.seller?.name)
          .filter((name) => name !== null && name !== undefined),
      ),
    ];

    for (const sName of uniqueSellers) {
      const username = sName.toLowerCase().trim().replace(/\s+/g, "-");
      const user = await User.findOneAndUpdate(
        { username },
        {
          name: sName,
          email: `${username}@nero.dummy`,
          privyDid: `did:privy:scraped-${username}`,
          isSeller: true,
          username: username,
          shop: { active: true, name: sName.toUpperCase() },
        },
        { upsert: true, new: true },
      );
      sellerMap[sName] = user._id;
    }

    // 3. Formatear Productos (Sin saltarse nada)
    const formattedProducts = productsData
      .map((p) => {
        // Si no hay titulo o precio, este SI es un error crítico
        if (!p.title || !p.price) return null;

        const hasDiscount =
          p.originalPrice && Number(p.price) < Number(p.originalPrice);

        // Si el seller name es null, usamos el ID del usuario genérico
        const sellerId = sellerMap[p.seller?.name] || genericUser._id;

        // Función para convertir "5mil" o "500" en 5000 o 500
        const parseSold = (soldStr) => {
          if (!soldStr) return 0;
          let clean = soldStr.toLowerCase().replace("+", "").replace(" ", "");
          if (clean.includes("mil")) {
            return parseFloat(clean.replace("mil", "")) * 1000;
          }
          return parseInt(clean) || 0;
        };

        // Función para asegurar que el rating sea un número entre 0 y 5
        const parseRating = (ratingStr) => {
          if (!ratingStr) return 0;
          return parseFloat(ratingStr) || 0;
        };

        const CLASSIFIED_CATEGORIES = [
  'autos-motos-y-otros',
  'inmuebles',
  'servicios'
];
    const getListingType = (category) => {
      return CLASSIFIED_CATEGORIES.includes(category) ? 'classified' : 'product'
    }
        return {
          name: p.title,
          description: p.description || "Sin descripción disponible.", // Evitamos el error si description es null
          brand: p.brand || "Genérico",
          price: hasDiscount ? Number(p.originalPrice) : Number(p.price),
          currency: p.currency || "ARS",
          sale: {
            active: hasDiscount,
            price: hasDiscount ? Number(p.price) : 0,
            expiresAt: hasDiscount
              ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              : null,
          },
          category: p.category || "Otros",
          subCategory: p.subCategory || "",
          condition: p.condition || "new",
          rating: parseRating(p.rating),
          sold: parseSold(p.sold),
          seller: sellerId, // <--- Aquí ya no va a fallar nunca
          sellerName: p.seller?.name || "Unknown",
          sellerIsVerified: p.seller?.isVerified || true,
          images: (p.gallery || []).map((url) => ({
            url,
            isMain: url === p.image,
          })),
          stock: Math.floor(Math.random() * 9) + 1,
          status: "active",
          specifications: p.specifications || [],
          shipping: { free: p.freeShipping || false, mode: "both" },
          location: {
            city: p.seller?.location?.split(", ")[0] || "Capital Federal",
            province: p.seller?.location?.split(", ")[1] || "Buenos Aires",
          },
          listingType: getListingType(p.category),
        };
      })
      .filter((p) => p !== null);

    await Product.deleteMany({}); // Limpiamos
    await Product.insertMany(formattedProducts);
    console.log(
      `✅ ¡Proceso terminado! ${formattedProducts.length} productos cargados.`,
    );

    process.exit();
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedDB();

