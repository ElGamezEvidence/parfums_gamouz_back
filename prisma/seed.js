import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL?.trim()) {
  console.error(`
[ERREUR] DATABASE_URL est introuvable.

1. Copiez backend/.env.example vers backend/.env
2. Collez votre URL Neon PostgreSQL, par exemple :
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
3. Relancez : npm run prisma:seed

(Voir docs/NEON_POSTGRESQL.md)
`);
  process.exit(1);
}

const { prisma } = await import('../src/config/db.js');

async function main() {
  console.log('--- DÉBUT DU SEED IDEMPOTENT GAAMOUZE ---');

  // 1. PROVISIONNEMENT ADMINISTRATEUR INITIAL
  const adminEmail = (process.env.ADMIN_EMAIL || 'abdelaligamouz@1448').toLowerCase().trim();
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    if (!initialPassword) {
      console.warn(
        `[SKIP] ADMIN_INITIAL_PASSWORD non défini — administrateur ${adminEmail} non créé.`
      );
    } else {
      const passwordHash = await bcrypt.hash(initialPassword, 12);
      const admin = await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          firstName: 'Abdelali',
          lastName: 'Gamouz',
          phone: '+212 671-545193',
          role: 'SUPER_ADMIN',
          mustChangePassword: true,
          isActive: true,
        },
      });
      console.log(
        `[OK] Administrateur créé : ${admin.email} (Changement de mot de passe requis au premier login)`
      );
    }
  } else {
    console.log(`[INFO] L'administrateur ${adminEmail} existe déjà. Mot de passe préservé.`);
  }

  // 2. CATÉGORIES INITIALES
  const initialCategories = [
    {
      slug: 'men',
      sortOrder: 1,
      image: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=800&q=80',
      translations: {
        fr: { name: 'Homme', description: 'Fragrances intenses, boisées et magnétiques.' },
        en: { name: 'Men', description: 'Intense, woody, and magnetic fragrances.' },
        ar: { name: 'عطور رجالية', description: 'نفحات خشبية حارة ومغناطيسية للرجل العصري.' },
      },
    },
    {
      slug: 'women',
      sortOrder: 2,
      image: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80',
      translations: {
        fr: { name: 'Femme', description: 'Sillages raffinés, solaires et floraux.' },
        en: { name: 'Women', description: 'Refined, solar, and floral trails.' },
        ar: { name: 'عطور نسائية', description: 'أثر عطري راقٍ ونفحات زهرية أنثوية خالدة.' },
      },
    },
    {
      slug: 'unisex',
      sortOrder: 3,
      image: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80',
      translations: {
        fr: { name: 'Unisexe', description: 'Compositions avant-gardistes défiant les conventions.' },
        en: { name: 'Unisex', description: 'Avant-garde compositions defying conventions.' },
        ar: { name: 'عطور للجنسين', description: 'تركيبات متوازنة وفخمة تناسب جميع الأذواق الرفيعة.' },
      },
    },
  ];

  const categoryMap = {};
  for (const cat of initialCategories) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { sortOrder: cat.sortOrder, image: cat.image },
      create: {
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        image: cat.image,
        isActive: true,
        translations: {
          create: Object.entries(cat.translations).map(([locale, data]) => ({
            locale,
            name: data.name,
            description: data.description,
          })),
        },
      },
    });
    categoryMap[cat.slug] = category.id;
  }
  console.log('[OK] Catégories synchronisées (Homme, Femme, Unisexe).');

  // 3. PARAMÈTRES DU SITE
  const siteSettings = [
    { key: 'shipping_free_threshold', value: '500', description: 'Seuil de livraison gratuite au Maroc (MAD)' },
    { key: 'shipping_standard_fee', value: '40', description: 'Frais de livraison standard (MAD)' },
    { key: 'contact_whatsapp', value: '+212671545193', description: 'Numéro WhatsApp officiel' },
    { key: 'contact_phone', value: '+212 671-545193', description: 'Téléphone affiché' },
    { key: 'contact_email', value: 'contact@gamouze.com', description: 'Email de contact' },
    { key: 'currency', value: 'MAD', description: 'Devise par défaut' },
    { key: 'site_slogan_fr', value: 'Laissez votre empreinte.', description: 'Slogan FR' },
    { key: 'site_slogan_en', value: 'Leave your mark.', description: 'Slogan EN' },
    { key: 'site_slogan_ar', value: 'اترك بصمتك.', description: 'Slogan AR' },
  ];

  for (const setting of siteSettings) {
    await prisma.siteSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log('[OK] Paramètres de boutique configurés.');

  // 4. CODES PROMOS
  await prisma.coupon.upsert({
    where: { code: 'EMPREINTE10' },
    update: {},
    create: {
      code: 'EMPREINTE10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 400,
      isActive: true,
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'WELCOME50' },
    update: {},
    create: {
      code: 'WELCOME50',
      discountType: 'FIXED',
      discountValue: 50,
      minOrderAmount: 500,
      isActive: true,
    },
  });
  console.log('[OK] Codes promotionnels initiaux créés (EMPREINTE10, WELCOME50).');

  // 5. CATALOGUE INITIAL DE PARFUMS HAUTE PARFUMERIE
  const perfumeSeeds = [
    {
      sku: 'GZ-ELEGANCE',
      slug: 'gamouze-elegance',
      gender: 'MEN',
      categorySlug: 'men',
      basePrice: 520,
      salePrice: 620,
      isFeatured: true,
      isBestSeller: true,
      isNew: false,
      images: [
        'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&w=800&q=80',
      ],
      variants: [
        { volume: '30ml', price: 380, sku: 'GZ-ELEG-30', stockQuantity: 25 },
        { volume: '50ml', price: 520, sku: 'GZ-ELEG-50', stockQuantity: 40, isDefault: true },
        { volume: '100ml', price: 790, sku: 'GZ-ELEG-100', stockQuantity: 15 },
      ],
      translations: {
        fr: {
          name: 'GAMOUZE Élégance',
          shortDescription: "Un sillage boisé et épicé d'une rare noblesse.",
          fullDescription: "GAMOUZE Élégance incarne l'homme charismatique avec ses notes vives de cardamome et son cœur de cèdre de l'Atlas.",
          olfactoryFamily: 'Boisé Épicé',
          topNotes: 'Cardamome noire, Bergamote de Calabre, Poivre rose',
          heartNotes: "Cèdre de l'Atlas, Iris florentin, Muscade",
          baseNotes: "Vétiver d'Haïti, Fève tonka, Cuir fumé",
        },
        en: {
          name: 'GAMOUZE Elegance',
          shortDescription: 'A woody and spicy trail of rare distinction.',
          fullDescription: 'GAMOUZE Elegance embodies charismatic masculinity with lively cardamom top notes and a heart of Atlas cedar.',
          olfactoryFamily: 'Woody Spicy',
          topNotes: 'Black Cardamom, Calabrian Bergamot, Pink Pepper',
          heartNotes: 'Atlas Cedar, Florentine Iris, Nutmeg',
          baseNotes: 'Haitian Vetiver, Tonka Bean, Smoky Leather',
        },
        ar: {
          name: 'GAMOUZE أناقة',
          shortDescription: 'نفحات خشبية حارة ذات نبل استثنائي.',
          fullDescription: 'يجسد عطر GAMOUZE أناقة الرجل الجذاب بنفحات الهيل المنعشة وقلب من خشب أرز الأطلس العريق.',
          olfactoryFamily: 'خشبي تابلي',
          topNotes: 'الهيل الأسود, برغموت كالابريا, الفلفل الوردي',
          heartNotes: 'خشب أرز الأطلس, سوسن فلورنسا, جوزة الطيب',
          baseNotes: 'نجيل الهند الهايتي, حبوب التونكا, الجلد المدخن',
        },
      },
    },
    {
      sku: 'GZ-NOIR',
      slug: 'gamouze-noir',
      gender: 'MEN',
      categorySlug: 'men',
      basePrice: 580,
      salePrice: 690,
      isFeatured: true,
      isBestSeller: true,
      isNew: false,
      images: [
        'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=800&q=80',
      ],
      variants: [
        { volume: '30ml', price: 420, sku: 'GZ-NOIR-30', stockQuantity: 20 },
        { volume: '50ml', price: 580, sku: 'GZ-NOIR-50', stockQuantity: 35, isDefault: true },
        { volume: '100ml', price: 860, sku: 'GZ-NOIR-100', stockQuantity: 12 },
      ],
      translations: {
        fr: {
          name: 'GAMOUZE Noir',
          shortDescription: 'Mystérieux, sombre et captivant.',
          fullDescription: "GAMOUZE Noir dévoile des accents fumés d'encens et de cuir sombre, magnifiés par la profondeur du patchouli indonésien.",
          olfactoryFamily: 'Oriental Cuiré',
          topNotes: 'Encens noir, Baies de genièvre, Pamplemousse amer',
          heartNotes: 'Cuir de Russie, Tabac blond, Cannelle de Ceylan',
          baseNotes: 'Patchouli sombre, Bois de gaïac, Ambre noir',
        },
        en: {
          name: 'GAMOUZE Noir',
          shortDescription: 'Mysterious, profound, and captivating.',
          fullDescription: 'GAMOUZE Noir reveals smoky whispers of incense and dark leather, elevated by rich Indonesian patchouli.',
          olfactoryFamily: 'Leather Oriental',
          topNotes: 'Black Incense, Juniper Berries, Bitter Grapefruit',
          heartNotes: 'Russian Leather, Blonde Tobacco, Ceylon Cinnamon',
          baseNotes: 'Dark Patchouli, Guaiac Wood, Black Amber',
        },
        ar: {
          name: 'GAMOUZE نوار',
          shortDescription: 'غامض، داكن وآسر إلى أبعد الحدود.',
          fullDescription: 'يكشف GAMOUZE نوار عن لمسات دخانية من البخور والجلد الفاخر، يعززها عمق الباتشولي الإندونيسي.',
          olfactoryFamily: 'جلدي شرقي',
          topNotes: 'البخور الأسود, حبوب العرعر, الجريب فروت المر',
          heartNotes: 'الجلد الروسي, التبغ الأشقر, قرفة سيلان',
          baseNotes: 'الباتشولي الداكن, خشب الغاياك, العنبر الأسود',
        },
      },
    },
    {
      sku: 'GZ-SIGNATURE',
      slug: 'gamouze-signature',
      gender: 'UNISEX',
      categorySlug: 'unisex',
      basePrice: 650,
      salePrice: 750,
      isFeatured: true,
      isBestSeller: true,
      isNew: false,
      images: [
        'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=800&q=80',
      ],
      variants: [
        { volume: '30ml', price: 470, sku: 'GZ-SIGN-30', stockQuantity: 30 },
        { volume: '50ml', price: 650, sku: 'GZ-SIGN-50', stockQuantity: 50, isDefault: true },
        { volume: '100ml', price: 950, sku: 'GZ-SIGN-100', stockQuantity: 20 },
      ],
      translations: {
        fr: {
          name: 'GAMOUZE Signature',
          shortDescription: "L'essence même de la maison GAMOUZE.",
          fullDescription: "Une alchimie parfaite entre la fraîcheur vive des agrumes orientaux et la chaleur opulente de l'ambre ambré.",
          olfactoryFamily: 'Ambré Floral',
          topNotes: "Mandarine royale, Safran d'Iran, Bergamote",
          heartNotes: "Rose centifolia, Bois d'ambre, Jasmin sambac",
          baseNotes: 'Ambre gris, Musc soyeux, Santal de Mysore',
        },
        en: {
          name: 'GAMOUZE Signature',
          shortDescription: 'The quintessential embodiment of Maison GAMOUZE.',
          fullDescription: 'A harmonious alchemy blending oriental citrus vitality with opulent amber warmth.',
          olfactoryFamily: 'Floral Amber',
          topNotes: 'Royal Mandarin, Persian Saffron, Bergamot',
          heartNotes: 'Centifolia Rose, Amberwood, Jasmine Sambac',
          baseNotes: 'Ambergris, Silky Musk, Mysore Sandalwood',
        },
        ar: {
          name: 'GAMOUZE سيغنتشر',
          shortDescription: 'الجوهر الحقيقي لدار GAMOUZE.',
          fullDescription: 'كيمياء متناغمة تجمع بين نضارة الحمضيات الشرقية والدفء الملكي الفاخر للعنبر الذهبي.',
          olfactoryFamily: 'زهري عنبري',
          topNotes: 'اليوسفي الملكي, زعفران إيراني خالص, البرغموت',
          heartNotes: 'وردة سينتيفوليا, خشب العنبر, ياسمين سامباك',
          baseNotes: 'عنبر الحوت النقي, المسك الحريري, صندل ميسور',
        },
      },
    },
    {
      sku: 'GZ-IMPERIAL-ROSE',
      slug: 'gamouze-imperial-rose',
      gender: 'WOMEN',
      categorySlug: 'women',
      basePrice: 590,
      salePrice: 690,
      isFeatured: true,
      isBestSeller: true,
      isNew: false,
      images: [
        'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80',
      ],
      variants: [
        { volume: '30ml', price: 430, sku: 'GZ-ROSE-30', stockQuantity: 20 },
        { volume: '50ml', price: 590, sku: 'GZ-ROSE-50', stockQuantity: 35, isDefault: true },
        { volume: '100ml', price: 880, sku: 'GZ-ROSE-100', stockQuantity: 15 },
      ],
      translations: {
        fr: {
          name: 'GAMOUZE Rose Impériale',
          shortDescription: "Une ode magistrale à la rose de Damas.",
          fullDescription: "La Rose Impériale s'épanouit au contact de litchi juteux et de musc blanc virginal, créant une aura de grâce incomparable.",
          olfactoryFamily: 'Floral Fruité',
          topNotes: 'Litchi givré, Poivre rose, Bergamote',
          heartNotes: 'Rose de Damas, Pivoine veloutée, Muguet',
          baseNotes: 'Musc blanc, Cèdre blanc, Vanille bourbon',
        },
        en: {
          name: 'GAMOUZE Imperial Rose',
          shortDescription: 'A majestic tribute to the Damask rose.',
          fullDescription: 'Imperial Rose flourishes alongside frosted lychee and ethereal white musk, radiating timeless grace.',
          olfactoryFamily: 'Fruity Floral',
          topNotes: 'Frosted Lychee, Pink Pepper, Bergamot',
          heartNotes: 'Damask Rose, Velvety Peony, Lily of the Valley',
          baseNotes: 'White Musk, White Cedar, Bourbon Vanilla',
        },
        ar: {
          name: 'GAMOUZE روز إمبريال',
          shortDescription: 'قصيدة فخمة مكرسة للورد الجوري الدمشقي.',
          fullDescription: 'تتألق الوردة الإمبراطورية بلمسات من الليتشي المثلج والمسك الأبيض الصافي، لتمنحكِ هالة من الأنوثة الراقية.',
          olfactoryFamily: 'زهري فاكهي',
          topNotes: 'ليتشي مثلج, فلفل وردي, برغموت',
          heartNotes: 'ورد دمشقي, بيوني مخملي, زنبق الوادي',
          baseNotes: 'مسك أبيض نقي, أرز أبيض, فانيليا بوربون',
        },
      },
    },
    {
      sku: 'GZ-OUD-ROYAL',
      slug: 'gamouze-oud-royal',
      gender: 'UNISEX',
      categorySlug: 'unisex',
      basePrice: 720,
      salePrice: 850,
      isFeatured: true,
      isBestSeller: true,
      isNew: true,
      images: [
        'https://images.unsplash.com/photo-1547887537-6158d64c35b3?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=800&q=80',
      ],
      variants: [
        { volume: '30ml', price: 520, sku: 'GZ-OUD-30', stockQuantity: 15 },
        { volume: '50ml', price: 720, sku: 'GZ-OUD-50', stockQuantity: 30, isDefault: true },
        { volume: '100ml', price: 1050, sku: 'GZ-OUD-100', stockQuantity: 10 },
      ],
      translations: {
        fr: {
          name: 'GAMOUZE Oud Royal',
          shortDescription: "L'or noir de la haute parfumerie.",
          fullDescription: "Un oud du Cambodge séculaire sublimé par l'ambre résineux et un sillage de cuir oriental opulent.",
          olfactoryFamily: 'Boisé Oriental',
          topNotes: 'Safran pur, Cardamome, Cannelle',
          heartNotes: 'Oud cambodgien, Rose taïf, Ambrette',
          baseNotes: 'Ambre foncé, Cuir souple, Patchouli',
        },
        en: {
          name: 'GAMOUZE Royal Oud',
          shortDescription: 'The black gold of haute perfumery.',
          fullDescription: 'Precious Cambodian oud enhanced by resinous amber and an opulent oriental leather trail.',
          olfactoryFamily: 'Woody Oriental',
          topNotes: 'Pure Saffron, Cardamom, Cinnamon',
          heartNotes: 'Cambodian Oud, Taif Rose, Ambrette',
          baseNotes: 'Dark Amber, Supple Leather, Patchouli',
        },
        ar: {
          name: 'GAMOUZE عود ملكي',
          shortDescription: 'الذهب الأسود لعالم العطور الراقية.',
          fullDescription: 'خلاصة دهن العود الكمبودي المعتق ممزوجة بالعنبر الأصيل وأفخر أنواع الجلود الشرقية.',
          olfactoryFamily: 'خشبي شرقي',
          topNotes: 'زعفران نقي, هيل فاخر, قرفة',
          heartNotes: 'دهن عود كمبودي, ورد طائفي, عنبر نباتي',
          baseNotes: 'عنبر ملكي داكن, جلد طبيعي, باتشولي معتق',
        },
      },
    },
    {
      sku: 'GZ-SOLEIL-D-OR',
      slug: 'gamouze-soleil-dor',
      gender: 'WOMEN',
      categorySlug: 'women',
      basePrice: 540,
      salePrice: null,
      isFeatured: false,
      isBestSeller: false,
      isNew: true,
      images: [
        'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80',
      ],
      variants: [
        { volume: '30ml', price: 390, sku: 'GZ-SOLEIL-30', stockQuantity: 25 },
        { volume: '50ml', price: 540, sku: 'GZ-SOLEIL-50', stockQuantity: 40, isDefault: true },
        { volume: '100ml', price: 820, sku: 'GZ-SOLEIL-100', stockQuantity: 18 },
      ],
      translations: {
        fr: {
          name: "GAMOUZE Soleil d'Or",
          shortDescription: "Un éclat solaire aux notes d'agrumes et de fleurs blanches.",
          fullDescription: "Une composition lumineuse et chaleureuse qui évoque les après-midis dorés sur les rivages de la Méditerranée.",
          olfactoryFamily: 'Solaire Floral',
          topNotes: 'Fleur d\'oranger, Néroli, Mandarine jaune',
          heartNotes: 'Jasmin solaire, Ylang-ylang des Comores, Tiaré',
          baseNotes: 'Bois de cèdre doré, Musc blanc, Vanille solaire',
        },
        en: {
          name: 'GAMOUZE Golden Sun',
          shortDescription: 'A radiant solar fragrance with citrus and white floral notes.',
          fullDescription: 'A luminous, warm composition evoking golden Mediterranean afternoons.',
          olfactoryFamily: 'Solar Floral',
          topNotes: 'Orange Blossom, Neroli, Yellow Mandarin',
          heartNotes: 'Solar Jasmine, Comoros Ylang-Ylang, Tiare',
          baseNotes: 'Golden Cedarwood, White Musk, Solar Vanilla',
        },
        ar: {
          name: 'GAMOUZE شمس الذهب',
          shortDescription: 'إشراقة شمسية دافئة بنفحات زهر البرتقال والزهور البيضاء.',
          fullDescription: 'توليفة مضيئة ومبهجة تستحضر الدفء الذهبي لشواطئ البحر الأبيض المتوسط.',
          olfactoryFamily: 'زهري مشمس',
          topNotes: 'زهر البرتقال, النيرولي, اليوسفي الأصفر',
          heartNotes: 'الياسمين المضيء, الإيلنغ, زهرة التياري',
          baseNotes: 'خشب الأرز الذهبي, المسك الأبيض, الفانيليا المشمسة',
        },
      },
    },
  ];

  for (const p of perfumeSeeds) {
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (!existing) {
      await prisma.product.create({
        data: {
          sku: p.sku,
          slug: p.slug,
          genderCategory: p.gender,
          categoryId: categoryMap[p.categorySlug] || null,
          basePrice: p.basePrice,
          salePrice: p.salePrice,
          isFeatured: p.isFeatured,
          isBestSeller: p.isBestSeller,
          isNew: p.isNew,
          status: 'PUBLISHED',
          translations: {
            create: Object.entries(p.translations).map(([locale, data]) => ({
              locale,
              name: data.name,
              shortDescription: data.shortDescription,
              fullDescription: data.fullDescription,
              olfactoryFamily: data.olfactoryFamily,
              topNotes: data.topNotes,
              heartNotes: data.heartNotes,
              baseNotes: data.baseNotes,
            })),
          },
          variants: {
            create: p.variants.map((v) => ({
              volume: v.volume,
              price: v.price,
              sku: v.sku,
              stockQuantity: v.stockQuantity,
              isDefault: v.isDefault || false,
            })),
          },
          images: {
            create: p.images.map((url, idx) => ({
              url,
              displayOrder: idx,
              isPrimary: idx === 0,
            })),
          },
        },
      });
      console.log(`[OK] Produit créé : ${p.sku} (${p.slug})`);
    } else {
      console.log(`[INFO] Produit ${p.sku} déjà présent en base.`);
    }
  }

  console.log('--- SEED IDEMPOTENT TERMINÉ AVEC SUCCÈS ---');
}

main()
  .catch((e) => {
    console.error('Erreur lors du seed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
