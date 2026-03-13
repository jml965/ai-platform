export interface TemplateFile {
  filePath: string;
  content: string;
  fileType: string;
}

export interface TemplateDefinition {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  files: TemplateFile[];
}

function wrapHtml(title: string, cssVars: string, bodyContent: string, extraCss: string = "", js: string = ""): TemplateFile[] {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
${bodyContent}
${js ? '<script src="main.js"></script>' : ''}
</body>
</html>`;

  const css = `/* CSS Variables */
:root {
${cssVars}
}

/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: var(--text); background: var(--bg); line-height: 1.6; }
a { text-decoration: none; color: inherit; }
img { max-width: 100%; height: auto; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
${extraCss}`;

  const files: TemplateFile[] = [
    { filePath: "index.html", content: html, fileType: "html" },
    { filePath: "style.css", content: css, fileType: "css" },
  ];
  if (js) {
    files.push({ filePath: "main.js", content: js, fileType: "javascript" });
  }
  return files;
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "ecommerce-store",
    nameEn: "Online Store",
    nameAr: "متجر إلكتروني",
    descriptionEn: "A modern e-commerce store with product grid, cart icon, and featured categories.",
    descriptionAr: "متجر إلكتروني عصري مع شبكة منتجات وسلة مشتريات وتصنيفات مميزة.",
    category: "ecommerce",
    files: wrapHtml("متجر إلكتروني",
      `  --primary: #6366f1;
  --primary-light: #818cf8;
  --bg: #0f0f1a;
  --surface: #1a1a2e;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --border: #2d2d44;`,
      `  <header style="background:var(--surface);border-bottom:1px solid var(--border);padding:16px 0;">
    <div class="container" style="display:flex;justify-content:space-between;align-items:center;">
      <h1 style="font-size:1.5rem;color:var(--primary);">🛒 المتجر</h1>
      <nav style="display:flex;gap:24px;align-items:center;">
        <a href="#" style="color:var(--text-muted);">الرئيسية</a>
        <a href="#" style="color:var(--text-muted);">المنتجات</a>
        <a href="#" style="color:var(--text-muted);">تواصل معنا</a>
        <span style="background:var(--primary);color:#fff;padding:6px 16px;border-radius:20px;font-size:0.875rem;cursor:pointer;">🛍️ السلة (0)</span>
      </nav>
    </div>
  </header>

  <section style="padding:60px 0;text-align:center;">
    <div class="container">
      <h2 style="font-size:2.5rem;margin-bottom:12px;">تسوق بذكاء</h2>
      <p style="color:var(--text-muted);font-size:1.125rem;margin-bottom:40px;">أفضل المنتجات بأسعار منافسة</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px;">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
          <div style="height:200px;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;font-size:3rem;">📦</div>
          <div style="padding:20px;">
            <h3 style="margin-bottom:8px;">سماعات لاسلكية</h3>
            <p style="color:var(--primary);font-size:1.25rem;font-weight:700;margin-bottom:16px;">199 ر.س</p>
            <button style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1rem;">أضف للسلة</button>
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
          <div style="height:200px;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;font-size:3rem;">📦</div>
          <div style="padding:20px;">
            <h3 style="margin-bottom:8px;">ساعة ذكية</h3>
            <p style="color:var(--primary);font-size:1.25rem;font-weight:700;margin-bottom:16px;">349 ر.س</p>
            <button style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1rem;">أضف للسلة</button>
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
          <div style="height:200px;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;font-size:3rem;">📦</div>
          <div style="padding:20px;">
            <h3 style="margin-bottom:8px;">حقيبة لابتوب</h3>
            <p style="color:var(--primary);font-size:1.25rem;font-weight:700;margin-bottom:16px;">129 ر.س</p>
            <button style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1rem;">أضف للسلة</button>
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
          <div style="height:200px;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;font-size:3rem;">📦</div>
          <div style="padding:20px;">
            <h3 style="margin-bottom:8px;">شاحن سريع</h3>
            <p style="color:var(--primary);font-size:1.25rem;font-weight:700;margin-bottom:16px;">79 ر.س</p>
            <button style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1rem;">أضف للسلة</button>
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
          <div style="height:200px;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;font-size:3rem;">📦</div>
          <div style="padding:20px;">
            <h3 style="margin-bottom:8px;">كيبورد ميكانيكي</h3>
            <p style="color:var(--primary);font-size:1.25rem;font-weight:700;margin-bottom:16px;">259 ر.س</p>
            <button style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1rem;">أضف للسلة</button>
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
          <div style="height:200px;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;font-size:3rem;">📦</div>
          <div style="padding:20px;">
            <h3 style="margin-bottom:8px;">ماوس احترافي</h3>
            <p style="color:var(--primary);font-size:1.25rem;font-weight:700;margin-bottom:16px;">149 ر.س</p>
            <button style="width:100%;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1rem;">أضف للسلة</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer style="background:var(--surface);border-top:1px solid var(--border);padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;">
    <div class="container">© 2025 المتجر. جميع الحقوق محفوظة.</div>
  </footer>`,
      `
header nav a:hover { color: var(--text); }
@media (max-width: 768px) {
  header nav { gap: 12px; font-size: 0.875rem; }
}`
    ),
  },
  {
    id: "restaurant",
    nameEn: "Restaurant",
    nameAr: "مطعم",
    descriptionEn: "An elegant restaurant website with menu, reservations section, and gallery.",
    descriptionAr: "موقع مطعم أنيق مع قائمة طعام وقسم حجوزات ومعرض صور.",
    category: "restaurant",
    files: wrapHtml("مطعم فاخر",
      `  --primary: #d4a853;
  --bg: #0c0c0c;
  --surface: #1a1a1a;
  --text: #f5f5f5;
  --text-muted: #999;
  --border: #333;`,
      `  <header style="background:transparent;position:absolute;width:100%;z-index:10;padding:20px 0;">
    <div class="container" style="display:flex;justify-content:space-between;align-items:center;">
      <h1 style="font-size:1.75rem;color:var(--primary);font-family:serif;">✦ المطعم الفاخر</h1>
      <nav style="display:flex;gap:28px;">
        <a href="#" style="color:var(--text-muted);">الرئيسية</a>
        <a href="#menu" style="color:var(--text-muted);">القائمة</a>
        <a href="#reserve" style="color:var(--text-muted);">حجز طاولة</a>
        <a href="#" style="color:var(--text-muted);">اتصل بنا</a>
      </nav>
    </div>
  </header>

  <section style="height:80vh;background:linear-gradient(rgba(0,0,0,0.6),rgba(0,0,0,0.8)),linear-gradient(135deg,#2c1810,#1a0f0a);display:flex;align-items:center;justify-content:center;text-align:center;">
    <div>
      <p style="color:var(--primary);letter-spacing:4px;margin-bottom:16px;text-transform:uppercase;font-size:0.875rem;">مرحباً بكم</p>
      <h2 style="font-size:3.5rem;font-family:serif;margin-bottom:20px;">تجربة طعام استثنائية</h2>
      <p style="color:var(--text-muted);font-size:1.125rem;margin-bottom:32px;">أطباق مميزة من أفضل الطهاة</p>
      <a href="#reserve" style="background:var(--primary);color:#000;padding:14px 36px;border-radius:4px;font-weight:600;display:inline-block;">احجز طاولتك</a>
    </div>
  </section>

  <section id="menu" style="padding:80px 0;">
    <div class="container" style="text-align:center;">
      <p style="color:var(--primary);letter-spacing:3px;font-size:0.875rem;">اكتشف</p>
      <h2 style="font-size:2.5rem;font-family:serif;margin:8px 0 48px;">قائمة الطعام</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:32px;">
        <div style="background:var(--surface);border:1px solid var(--border);padding:32px;border-radius:8px;text-align:center;">
          <div style="font-size:3rem;margin-bottom:16px;">🥩</div>
          <h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">ستيك ريب آي</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">مع صوص الفطر والخضار المشوية</p>
          <p style="font-size:1.25rem;font-weight:700;">185 ر.س</p>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);padding:32px;border-radius:8px;text-align:center;">
          <div style="font-size:3rem;margin-bottom:16px;">🐟</div>
          <h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">سلمون مشوي</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">مع الأرز البري وصوص الليمون</p>
          <p style="font-size:1.25rem;font-weight:700;">165 ر.س</p>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);padding:32px;border-radius:8px;text-align:center;">
          <div style="font-size:3rem;margin-bottom:16px;">🍝</div>
          <h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">باستا ترافل</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">مع جبنة بارميزان والفطر</p>
          <p style="font-size:1.25rem;font-weight:700;">125 ر.س</p>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);padding:32px;border-radius:8px;text-align:center;">
          <div style="font-size:3rem;margin-bottom:16px;">🥗</div>
          <h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">سلطة قيصر</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">مع الدجاج المشوي والخبز المحمص</p>
          <p style="font-size:1.25rem;font-weight:700;">75 ر.س</p>
        </div>
      </div>
    </div>
  </section>

  <section id="reserve" style="padding:80px 0;background:var(--surface);">
    <div class="container" style="max-width:600px;text-align:center;">
      <h2 style="font-size:2rem;font-family:serif;margin-bottom:32px;color:var(--primary);">احجز طاولتك</h2>
      <form style="display:grid;gap:16px;">
        <input placeholder="الاسم" style="padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;">
        <input type="date" style="padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;">
        <select style="padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;">
          <option>عدد الأشخاص</option><option>2</option><option>4</option><option>6</option><option>8+</option>
        </select>
        <button type="button" style="padding:14px;background:var(--primary);color:#000;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;">تأكيد الحجز</button>
      </form>
    </div>
  </section>

  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);">
    <div class="container">© 2025 المطعم الفاخر. جميع الحقوق محفوظة.</div>
  </footer>`,
      `
@media (max-width: 768px) {
  header nav { gap: 16px; font-size: 0.875rem; }
  section h2 { font-size: 2rem !important; }
}`
    ),
  },
  {
    id: "corporate",
    nameEn: "Corporate",
    nameAr: "شركة",
    descriptionEn: "A professional corporate website with services, about us, and contact sections.",
    descriptionAr: "موقع شركة احترافي مع أقسام الخدمات وعن الشركة والتواصل.",
    category: "corporate",
    files: wrapHtml("شركة احترافية",
      `  --primary: #3b82f6;
  --primary-dark: #2563eb;
  --bg: #0a0a14;
  --surface: #111827;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --border: #1e293b;`,
      `  <header style="background:var(--surface);border-bottom:1px solid var(--border);padding:16px 0;">
    <div class="container" style="display:flex;justify-content:space-between;align-items:center;">
      <h1 style="font-size:1.5rem;color:var(--primary);">◆ تقنية المستقبل</h1>
      <nav style="display:flex;gap:24px;align-items:center;">
        <a href="#">الرئيسية</a><a href="#services">خدماتنا</a><a href="#about">عن الشركة</a>
        <a href="#contact" style="background:var(--primary);color:#fff;padding:8px 20px;border-radius:8px;">تواصل معنا</a>
      </nav>
    </div>
  </header>

  <section style="padding:100px 0;text-align:center;background:linear-gradient(180deg,var(--surface),var(--bg));">
    <div class="container">
      <h2 style="font-size:3rem;margin-bottom:16px;">حلول تقنية مبتكرة</h2>
      <p style="color:var(--text-muted);font-size:1.2rem;max-width:600px;margin:0 auto 40px;">نقدم أحدث الحلول التقنية لتحويل أعمالك الرقمية وتسريع نموها.</p>
      <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
        <a href="#services" style="background:var(--primary);color:#fff;padding:14px 32px;border-radius:10px;font-weight:600;">اكتشف خدماتنا</a>
        <a href="#contact" style="border:1px solid var(--border);padding:14px 32px;border-radius:10px;color:var(--text);">تواصل معنا</a>
      </div>
    </div>
  </section>

  <section id="services" style="padding:80px 0;">
    <div class="container" style="text-align:center;">
      <h2 style="font-size:2.25rem;margin-bottom:48px;">خدماتنا</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px;">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:16px;">💻</div>
          <h3 style="margin-bottom:8px;color:var(--primary);">تطوير البرمجيات</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;">بناء تطبيقات ويب وموبايل متقدمة بأحدث التقنيات</p>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:16px;">🔒</div>
          <h3 style="margin-bottom:8px;color:var(--primary);">الأمن السيبراني</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;">حماية بياناتك وأنظمتك من التهديدات الإلكترونية</p>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:16px;">☁️</div>
          <h3 style="margin-bottom:8px;color:var(--primary);">الحوسبة السحابية</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;">حلول سحابية مرنة وقابلة للتوسع</p>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:16px;">🤖</div>
          <h3 style="margin-bottom:8px;color:var(--primary);">الذكاء الاصطناعي</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;">أتمتة العمليات وتحليل البيانات بالذكاء الاصطناعي</p>
        </div>
      </div>
    </div>
  </section>

  <section id="about" style="padding:80px 0;background:var(--surface);">
    <div class="container" style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;">
      <div>
        <h2 style="font-size:2.25rem;margin-bottom:16px;">عن الشركة</h2>
        <p style="color:var(--text-muted);margin-bottom:24px;">نحن شركة رائدة في مجال التقنية، نقدم حلولاً مبتكرة منذ 2015. فريقنا من المتخصصين يعمل على تقديم أفضل الخدمات.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div style="background:var(--bg);padding:20px;border-radius:12px;text-align:center;">
            <div style="font-size:1.75rem;font-weight:700;color:var(--primary);">200+</div>
            <div style="color:var(--text-muted);font-size:0.875rem;">عميل</div>
          </div>
          <div style="background:var(--bg);padding:20px;border-radius:12px;text-align:center;">
            <div style="font-size:1.75rem;font-weight:700;color:var(--primary);">50+</div>
            <div style="color:var(--text-muted);font-size:0.875rem;">مشروع سنوياً</div>
          </div>
          <div style="background:var(--bg);padding:20px;border-radius:12px;text-align:center;">
            <div style="font-size:1.75rem;font-weight:700;color:var(--primary);">99%</div>
            <div style="color:var(--text-muted);font-size:0.875rem;">رضا العملاء</div>
          </div>
          <div style="background:var(--bg);padding:20px;border-radius:12px;text-align:center;">
            <div style="font-size:1.75rem;font-weight:700;color:var(--primary);">25+</div>
            <div style="color:var(--text-muted);font-size:0.875rem;">خبير تقني</div>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));border-radius:20px;height:350px;display:flex;align-items:center;justify-content:center;font-size:5rem;">🏢</div>
    </div>
  </section>

  <section id="contact" style="padding:80px 0;">
    <div class="container" style="max-width:600px;text-align:center;">
      <h2 style="font-size:2.25rem;margin-bottom:32px;">تواصل معنا</h2>
      <form style="display:grid;gap:16px;">
        <input placeholder="الاسم الكامل" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;">
        <input placeholder="البريد الإلكتروني" type="email" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;">
        <textarea placeholder="رسالتك" rows="4" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;resize:vertical;"></textarea>
        <button type="button" style="padding:14px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;">إرسال</button>
      </form>
    </div>
  </section>

  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);">
    <div class="container">© 2025 تقنية المستقبل. جميع الحقوق محفوظة.</div>
  </footer>`,
      `
@media (max-width: 768px) {
  #about .container { grid-template-columns: 1fr !important; }
  header nav { gap: 16px; font-size: 0.875rem; }
}`
    ),
  },
  {
    id: "portfolio",
    nameEn: "Portfolio",
    nameAr: "محفظة أعمال",
    descriptionEn: "A creative portfolio showcasing projects with a modern grid layout.",
    descriptionAr: "محفظة أعمال إبداعية لعرض المشاريع بتصميم شبكي حديث.",
    category: "portfolio",
    files: wrapHtml("محفظة أعمال",
      `  --primary: #a855f7;
  --primary-light: #c084fc;
  --bg: #09090b;
  --surface: #18181b;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --border: #27272a;`,
      `  <header style="padding:20px 0;">
    <div class="container" style="display:flex;justify-content:space-between;align-items:center;">
      <h1 style="font-size:1.5rem;">أحمد <span style="color:var(--primary);">المصمم</span></h1>
      <nav style="display:flex;gap:24px;color:var(--text-muted);">
        <a href="#">الرئيسية</a><a href="#works">أعمالي</a><a href="#skills">مهاراتي</a><a href="#contact">تواصل</a>
      </nav>
    </div>
  </header>

  <section style="padding:80px 0;text-align:center;">
    <div class="container">
      <div style="width:120px;height:120px;background:linear-gradient(135deg,var(--primary),var(--primary-light));border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:3rem;">👨‍💻</div>
      <h2 style="font-size:2.75rem;margin-bottom:12px;">مصمم ومطور ويب</h2>
      <p style="color:var(--text-muted);font-size:1.125rem;max-width:500px;margin:0 auto 32px;">أحوّل أفكارك إلى مواقع ويب وتطبيقات جذابة وعملية</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <a href="#works" style="background:var(--primary);color:#fff;padding:12px 28px;border-radius:10px;font-weight:600;">عرض أعمالي</a>
        <a href="#contact" style="border:1px solid var(--border);padding:12px 28px;border-radius:10px;color:var(--text);">تواصل معي</a>
      </div>
    </div>
  </section>

  <section id="works" style="padding:80px 0;">
    <div class="container" style="text-align:center;">
      <h2 style="font-size:2.25rem;margin-bottom:48px;">أعمالي المميزة</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:200px;background:linear-gradient(135deg,#6366f1,#6366f199);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">💳</div><div style="padding:20px;"><h3 style="margin-bottom:8px;">تطبيق مالي</h3><p style="color:var(--text-muted);font-size:0.875rem;">تصميم وتطوير كامل</p></div></div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:200px;background:linear-gradient(135deg,#10b981,#10b98199);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">📚</div><div style="padding:20px;"><h3 style="margin-bottom:8px;">منصة تعليمية</h3><p style="color:var(--text-muted);font-size:0.875rem;">تصميم وتطوير كامل</p></div></div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:200px;background:linear-gradient(135deg,#f43f5e,#f43f5e99);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">👗</div><div style="padding:20px;"><h3 style="margin-bottom:8px;">متجر أزياء</h3><p style="color:var(--text-muted);font-size:0.875rem;">تصميم وتطوير كامل</p></div></div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:200px;background:linear-gradient(135deg,#06b6d4,#06b6d499);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">🏋️</div><div style="padding:20px;"><h3 style="margin-bottom:8px;">تطبيق صحي</h3><p style="color:var(--text-muted);font-size:0.875rem;">تصميم وتطوير كامل</p></div></div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:200px;background:linear-gradient(135deg,#f59e0b,#f59e0b99);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">📊</div><div style="padding:20px;"><h3 style="margin-bottom:8px;">لوحة تحكم</h3><p style="color:var(--text-muted);font-size:0.875rem;">تصميم وتطوير كامل</p></div></div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:200px;background:linear-gradient(135deg,#8b5cf6,#8b5cf699);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">✈️</div><div style="padding:20px;"><h3 style="margin-bottom:8px;">موقع سفر</h3><p style="color:var(--text-muted);font-size:0.875rem;">تصميم وتطوير كامل</p></div></div>
      </div>
    </div>
  </section>

  <section id="skills" style="padding:80px 0;background:var(--surface);">
    <div class="container" style="text-align:center;">
      <h2 style="font-size:2.25rem;margin-bottom:48px;">مهاراتي</h2>
      <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">React</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">Vue.js</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">TypeScript</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">Node.js</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">Figma</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">Tailwind CSS</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">Python</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">Docker</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">PostgreSQL</span>
        <span style="background:var(--bg);border:1px solid var(--border);padding:10px 24px;border-radius:10px;font-size:0.9rem;">AWS</span>
      </div>
    </div>
  </section>

  <section id="contact" style="padding:80px 0;">
    <div class="container" style="max-width:500px;text-align:center;">
      <h2 style="font-size:2.25rem;margin-bottom:32px;">تواصل معي</h2>
      <form style="display:grid;gap:14px;">
        <input placeholder="اسمك" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;">
        <input placeholder="بريدك الإلكتروني" type="email" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;">
        <textarea placeholder="رسالتك" rows="4" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;resize:vertical;"></textarea>
        <button type="button" style="padding:14px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;">إرسال</button>
      </form>
    </div>
  </section>

  <footer style="padding:24px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);">
    <div class="container">© 2025 أحمد المصمم. جميع الحقوق محفوظة.</div>
  </footer>`
    ),
  },
  {
    id: "blog",
    nameEn: "Blog",
    nameAr: "مدونة",
    descriptionEn: "A clean blog layout with featured posts, categories, and reading time.",
    descriptionAr: "تصميم مدونة نظيف مع مقالات مميزة وتصنيفات ووقت القراءة.",
    category: "blog",
    files: wrapHtml("مدونة تقنية",
      `  --primary: #10b981;
  --bg: #0a0a0f;
  --surface: #141420;
  --text: #f0fdf4;
  --text-muted: #86efac80;
  --border: #1c1c2e;`,
      `  <header style="padding:16px 0;border-bottom:1px solid var(--border);background:var(--surface);">
    <div class="container" style="display:flex;justify-content:space-between;align-items:center;">
      <h1 style="font-size:1.5rem;color:var(--primary);">📝 مدونتي</h1>
      <nav style="display:flex;gap:20px;color:var(--text-muted);">
        <a href="#">الرئيسية</a><a href="#">المقالات</a><a href="#">التصنيفات</a><a href="#">حول</a>
      </nav>
    </div>
  </header>
  <section style="padding:60px 0;">
    <div class="container">
      <div style="background:linear-gradient(135deg,#10b981,#059669);border-radius:20px;padding:48px;margin-bottom:48px;">
        <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-size:0.8rem;">مقال مميز</span>
        <h2 style="font-size:2rem;margin:16px 0 12px;">مستقبل الذكاء الاصطناعي في تطوير الويب</h2>
        <p style="opacity:0.85;margin-bottom:20px;">كيف سيغير الذكاء الاصطناعي طريقة بناء المواقع والتطبيقات في السنوات القادمة.</p>
        <span style="opacity:0.7;font-size:0.875rem;">5 دقائق قراءة · 15 مارس 2025</span>
      </div>
      <h3 style="font-size:1.5rem;margin-bottom:24px;">أحدث المقالات</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;">
        <article style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:160px;background:linear-gradient(135deg,var(--surface),#1a2a1a);display:flex;align-items:center;justify-content:center;font-size:3rem;">🎨</div><div style="padding:20px;"><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="background:var(--primary);color:#000;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;">تصميم</span><span style="color:var(--text-muted);font-size:0.8rem;">3 دقائق</span></div><h4 style="margin-bottom:8px;font-size:1.05rem;">أفضل أدوات CSS في 2025</h4><a href="#" style="color:var(--primary);font-size:0.875rem;">اقرأ المزيد →</a></div></article>
        <article style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:160px;background:linear-gradient(135deg,var(--surface),#1a2a1a);display:flex;align-items:center;justify-content:center;font-size:3rem;">📘</div><div style="padding:20px;"><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="background:var(--primary);color:#000;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;">برمجة</span><span style="color:var(--text-muted);font-size:0.8rem;">8 دقائق</span></div><h4 style="margin-bottom:8px;font-size:1.05rem;">دليل TypeScript الشامل</h4><a href="#" style="color:var(--primary);font-size:0.875rem;">اقرأ المزيد →</a></div></article>
        <article style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:160px;background:linear-gradient(135deg,var(--surface),#1a2a1a);display:flex;align-items:center;justify-content:center;font-size:3rem;">⚙️</div><div style="padding:20px;"><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="background:var(--primary);color:#000;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;">خلفية</span><span style="color:var(--text-muted);font-size:0.8rem;">6 دقائق</span></div><h4 style="margin-bottom:8px;font-size:1.05rem;">بناء API متكامل مع Node.js</h4><a href="#" style="color:var(--primary);font-size:0.875rem;">اقرأ المزيد →</a></div></article>
      </div>
    </div>
  </section>
  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);"><div class="container">© 2025 مدونتي التقنية. جميع الحقوق محفوظة.</div></footer>`,
      `
@media (max-width: 768px) {
  section > .container > div:first-child { grid-template-columns: 1fr !important; }
}`
    ),
  },
  {
    id: "medical-clinic",
    nameEn: "Medical Clinic",
    nameAr: "عيادة طبية",
    descriptionEn: "A professional medical clinic website with doctors, services, and appointment booking.",
    descriptionAr: "موقع عيادة طبية احترافي مع الأطباء والخدمات وحجز المواعيد.",
    category: "medical",
    files: wrapHtml("عيادة طبية",
      `  --primary: #14b8a6;
  --bg: #0a1014;
  --surface: #111a20;
  --text: #f0fdfa;
  --text-muted: #94a3b8;
  --border: #1e2d38;`,
      `  <header style="background:var(--surface);padding:16px 0;border-bottom:1px solid var(--border);"><div class="container" style="display:flex;justify-content:space-between;align-items:center;"><h1 style="font-size:1.5rem;color:var(--primary);">🏥 عيادة الشفاء</h1><nav style="display:flex;gap:24px;color:var(--text-muted);"><a href="#">الرئيسية</a><a href="#services">الخدمات</a><a href="#doctors">الأطباء</a><a href="#booking">حجز موعد</a></nav></div></header>
  <section style="padding:80px 0;text-align:center;background:linear-gradient(180deg,var(--surface),var(--bg));"><div class="container"><h2 style="font-size:2.75rem;margin-bottom:16px;">صحتك أولويتنا</h2><p style="color:var(--text-muted);font-size:1.125rem;max-width:550px;margin:0 auto 32px;">رعاية طبية متميزة بأيدي أفضل الأطباء المتخصصين وأحدث التقنيات.</p><a href="#booking" style="background:var(--primary);color:#000;padding:14px 32px;border-radius:10px;font-weight:600;display:inline-block;">احجز موعدك الآن</a></div></section>
  <section id="services" style="padding:80px 0;"><div class="container" style="text-align:center;"><h2 style="font-size:2.25rem;margin-bottom:48px;">خدماتنا الطبية</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px;"><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:12px;">🩺</div><h3 style="color:var(--primary);font-size:1rem;">طب عام</h3></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:12px;">🦷</div><h3 style="color:var(--primary);font-size:1rem;">أسنان</h3></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:12px;">👁️</div><h3 style="color:var(--primary);font-size:1rem;">عيون</h3></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:12px;">🧴</div><h3 style="color:var(--primary);font-size:1rem;">جلدية</h3></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:12px;">👶</div><h3 style="color:var(--primary);font-size:1rem;">أطفال</h3></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:12px;">🦴</div><h3 style="color:var(--primary);font-size:1rem;">عظام</h3></div></div></div></section>
  <section id="doctors" style="padding:80px 0;background:var(--surface);"><div class="container" style="text-align:center;"><h2 style="font-size:2.25rem;margin-bottom:48px;">أطباؤنا</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px;"><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="width:80px;height:80px;background:linear-gradient(135deg,var(--primary),#0d9488);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:2rem;">👩‍⚕️</div><h3 style="margin-bottom:4px;">د. سارة أحمد</h3><p style="color:var(--primary);font-size:0.875rem;">طب عام</p></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="width:80px;height:80px;background:linear-gradient(135deg,var(--primary),#0d9488);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:2rem;">👨‍⚕️</div><h3 style="margin-bottom:4px;">د. خالد العمري</h3><p style="color:var(--primary);font-size:0.875rem;">أسنان</p></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="width:80px;height:80px;background:linear-gradient(135deg,var(--primary),#0d9488);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:2rem;">👩‍⚕️</div><h3 style="margin-bottom:4px;">د. نورة الفهد</h3><p style="color:var(--primary);font-size:0.875rem;">عيون</p></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="width:80px;height:80px;background:linear-gradient(135deg,var(--primary),#0d9488);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:2rem;">👨‍⚕️</div><h3 style="margin-bottom:4px;">د. محمد السالم</h3><p style="color:var(--primary);font-size:0.875rem;">جلدية</p></div></div></div></section>
  <section id="booking" style="padding:80px 0;"><div class="container" style="max-width:550px;text-align:center;"><h2 style="font-size:2.25rem;margin-bottom:32px;color:var(--primary);">حجز موعد</h2><form style="display:grid;gap:14px;"><input placeholder="الاسم الكامل" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;"><input placeholder="رقم الهاتف" type="tel" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;"><select style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;"><option>اختر التخصص</option><option>طب عام</option><option>أسنان</option><option>عيون</option><option>جلدية</option></select><input type="date" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:1rem;"><button type="button" style="padding:14px;background:var(--primary);color:#000;border:none;border-radius:10px;font-weight:600;cursor:pointer;">تأكيد الحجز</button></form></div></section>
  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);"><div class="container">© 2025 عيادة الشفاء. جميع الحقوق محفوظة.</div></footer>`
    ),
  },
  {
    id: "law-firm",
    nameEn: "Law Firm",
    nameAr: "مكتب محاماة",
    descriptionEn: "A prestigious law firm website with practice areas, team, and consultation booking.",
    descriptionAr: "موقع مكتب محاماة راقي مع مجالات الممارسة والفريق وحجز الاستشارات.",
    category: "legal",
    files: wrapHtml("مكتب محاماة",
      `  --primary: #c9a84c;
  --bg: #0b0b10;
  --surface: #141418;
  --text: #f5f5f0;
  --text-muted: #9ca3af;
  --border: #252530;`,
      `  <header style="background:var(--surface);padding:16px 0;border-bottom:1px solid var(--border);"><div class="container" style="display:flex;justify-content:space-between;align-items:center;"><h1 style="font-size:1.5rem;color:var(--primary);font-family:serif;">⚖️ العدالة للمحاماة</h1><nav style="display:flex;gap:24px;color:var(--text-muted);"><a href="#">الرئيسية</a><a href="#areas">مجالاتنا</a><a href="#team">الفريق</a><a href="#consult" style="background:var(--primary);color:#000;padding:8px 20px;border-radius:6px;font-weight:600;">استشارة مجانية</a></nav></div></header>
  <section style="height:75vh;background:linear-gradient(rgba(0,0,0,0.7),rgba(0,0,0,0.8)),linear-gradient(135deg,#1a1510,#0b0b10);display:flex;align-items:center;"><div class="container"><p style="color:var(--primary);letter-spacing:3px;font-size:0.875rem;margin-bottom:12px;">خبرة · نزاهة · عدالة</p><h2 style="font-size:3rem;font-family:serif;margin-bottom:16px;max-width:600px;">نحمي حقوقك بخبرة تمتد لعقود</h2><p style="color:var(--text-muted);font-size:1.1rem;max-width:500px;margin-bottom:32px;">فريق من المحامين المتخصصين لتقديم أفضل الحلول القانونية.</p><a href="#consult" style="background:var(--primary);color:#000;padding:14px 32px;border-radius:6px;font-weight:600;display:inline-block;">احصل على استشارة</a></div></section>
  <section id="areas" style="padding:80px 0;"><div class="container" style="text-align:center;"><h2 style="font-size:2.25rem;font-family:serif;margin-bottom:48px;">مجالات الممارسة</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px;"><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">📋</div><h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">القانون التجاري</h3><p style="color:var(--text-muted);font-size:0.85rem;">عقود، شركات، نزاعات تجارية</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">🏠</div><h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">القانون العقاري</h3><p style="color:var(--text-muted);font-size:0.85rem;">بيع، شراء، إيجار، نزاعات</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">⚖️</div><h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">القانون الجنائي</h3><p style="color:var(--text-muted);font-size:0.85rem;">دفاع جنائي ومرافعات</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">👔</div><h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">قانون العمل</h3><p style="color:var(--text-muted);font-size:0.85rem;">عقود عمل، فصل تعسفي</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">👨‍👩‍👧‍👦</div><h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">قانون الأسرة</h3><p style="color:var(--text-muted);font-size:0.85rem;">طلاق، حضانة، نفقة</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">💡</div><h3 style="color:var(--primary);margin-bottom:8px;font-family:serif;">الملكية الفكرية</h3><p style="color:var(--text-muted);font-size:0.85rem;">براءات اختراع، علامات تجارية</p></div></div></div></section>
  <section id="consult" style="padding:80px 0;"><div class="container" style="max-width:550px;text-align:center;"><h2 style="font-size:2rem;font-family:serif;margin-bottom:8px;color:var(--primary);">استشارة مجانية</h2><p style="color:var(--text-muted);margin-bottom:32px;">احصل على استشارة قانونية مجانية من خبرائنا</p><form style="display:grid;gap:14px;"><input placeholder="الاسم الكامل" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;"><input placeholder="رقم الهاتف" type="tel" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;"><textarea placeholder="صف قضيتك باختصار" rows="4" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;resize:vertical;"></textarea><button type="button" style="padding:14px;background:var(--primary);color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;">طلب استشارة</button></form></div></section>
  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);"><div class="container">© 2025 العدالة للمحاماة. جميع الحقوق محفوظة.</div></footer>`
    ),
  },
  {
    id: "marketing-agency",
    nameEn: "Marketing Agency",
    nameAr: "وكالة تسويق",
    descriptionEn: "A vibrant marketing agency website with services, case studies, and CTA sections.",
    descriptionAr: "موقع وكالة تسويق حيوي مع الخدمات ودراسات الحالة وأقسام الدعوة للعمل.",
    category: "marketing",
    files: wrapHtml("وكالة تسويق",
      `  --primary: #f43f5e;
  --bg: #0a0a0f;
  --surface: #141420;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --border: #27272a;`,
      `  <header style="padding:16px 0;background:var(--surface);border-bottom:1px solid var(--border);"><div class="container" style="display:flex;justify-content:space-between;align-items:center;"><h1 style="font-size:1.5rem;">📣 <span style="color:var(--primary);">بلس</span> للتسويق</h1><nav style="display:flex;gap:20px;align-items:center;color:var(--text-muted);"><a href="#">الرئيسية</a><a href="#services">خدماتنا</a><a href="#results">نتائجنا</a><a href="#contact" style="background:var(--primary);color:#fff;padding:8px 20px;border-radius:8px;font-weight:600;">ابدأ الآن</a></nav></div></header>
  <section style="padding:100px 0;text-align:center;background:linear-gradient(180deg,var(--surface),var(--bg));"><div class="container"><span style="background:var(--primary);color:#fff;padding:6px 16px;border-radius:20px;font-size:0.8rem;font-weight:600;display:inline-block;margin-bottom:20px;">🔥 نتائج حقيقية</span><h2 style="font-size:3rem;margin-bottom:16px;">نطلق علامتك التجارية<br>إلى القمة</h2><p style="color:var(--text-muted);font-size:1.125rem;max-width:550px;margin:0 auto 40px;">استراتيجيات تسويق رقمي مبتكرة تحقق نتائج ملموسة وعائد استثمار مرتفع.</p><div style="display:flex;gap:40px;justify-content:center;"><div style="text-align:center;"><div style="font-size:2rem;font-weight:800;color:var(--primary);">500+</div><div style="color:var(--text-muted);font-size:0.875rem;">عميل</div></div><div style="text-align:center;"><div style="font-size:2rem;font-weight:800;color:var(--primary);">3x</div><div style="color:var(--text-muted);font-size:0.875rem;">متوسط النمو</div></div><div style="text-align:center;"><div style="font-size:2rem;font-weight:800;color:var(--primary);">95%</div><div style="color:var(--text-muted);font-size:0.875rem;">رضا العملاء</div></div></div></div></section>
  <section id="services" style="padding:80px 0;"><div class="container" style="text-align:center;"><h2 style="font-size:2.25rem;margin-bottom:48px;">خدماتنا</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px;"><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:16px;">📱</div><h3 style="margin-bottom:8px;">إدارة السوشيال ميديا</h3><p style="color:var(--text-muted);font-size:0.9rem;">محتوى إبداعي وتفاعل مع الجمهور</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:16px;">📊</div><h3 style="margin-bottom:8px;">الإعلانات المدفوعة</h3><p style="color:var(--text-muted);font-size:0.9rem;">حملات مستهدفة على كل المنصات</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:16px;">🔍</div><h3 style="margin-bottom:8px;">تحسين محركات البحث</h3><p style="color:var(--text-muted);font-size:0.9rem;">تصدّر نتائج البحث وجذب زيارات</p></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:16px;">🎨</div><h3 style="margin-bottom:8px;">تصميم الهوية البصرية</h3><p style="color:var(--text-muted);font-size:0.9rem;">علامة تجارية قوية ومميزة</p></div></div></div></section>
  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);"><div class="container">© 2025 بلس للتسويق. جميع الحقوق محفوظة.</div></footer>`
    ),
  },
  {
    id: "landing-page",
    nameEn: "Landing Page",
    nameAr: "صفحة هبوط",
    descriptionEn: "A high-converting landing page with hero, features, testimonials, and CTA.",
    descriptionAr: "صفحة هبوط عالية التحويل مع قسم رئيسي ومميزات وشهادات ودعوة للعمل.",
    category: "landing",
    files: wrapHtml("صفحة هبوط",
      `  --primary: #8b5cf6;
  --primary-light: #a78bfa;
  --bg: #09090b;
  --surface: #18181b;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --border: #27272a;`,
      `  <header style="padding:16px 0;position:sticky;top:0;background:var(--bg);z-index:10;border-bottom:1px solid var(--border);"><div class="container" style="display:flex;justify-content:space-between;align-items:center;"><h1 style="font-size:1.5rem;">🚀 <span style="color:var(--primary);">AppFlow</span></h1><nav style="display:flex;gap:20px;align-items:center;color:var(--text-muted);"><a href="#features">المميزات</a><a href="#testimonials">الآراء</a><a href="#pricing">الأسعار</a><a href="#cta" style="background:var(--primary);color:#fff;padding:8px 20px;border-radius:8px;font-weight:600;">ابدأ مجاناً</a></nav></div></header>
  <section style="padding:100px 0;text-align:center;"><div class="container"><span style="background:var(--primary);color:#fff;padding:6px 16px;border-radius:20px;font-size:0.8rem;display:inline-block;margin-bottom:20px;">✨ جديد — الإصدار 3.0</span><h2 style="font-size:3.25rem;margin-bottom:16px;max-width:700px;margin-left:auto;margin-right:auto;">أدِر مشاريعك بذكاء وسرعة فائقة</h2><p style="color:var(--text-muted);font-size:1.125rem;max-width:550px;margin:0 auto 40px;">منصة واحدة لإدارة المهام والفرق والمشاريع. وفّر وقتك وزد إنتاجيتك.</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;"><a href="#cta" style="background:var(--primary);color:#fff;padding:14px 32px;border-radius:10px;font-weight:600;">ابدأ مجاناً</a><a href="#features" style="border:1px solid var(--border);padding:14px 32px;border-radius:10px;color:var(--text);">تعرف أكثر</a></div><div style="margin-top:48px;background:var(--surface);border:1px solid var(--border);border-radius:20px;height:300px;display:flex;align-items:center;justify-content:center;font-size:4rem;">📊</div></div></section>
  <section id="features" style="padding:80px 0;background:var(--surface);"><div class="container" style="text-align:center;"><h2 style="font-size:2.25rem;margin-bottom:48px;">لماذا AppFlow؟</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px;"><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">✨</div><h3 style="margin-bottom:8px;font-size:1rem;">سهولة الاستخدام</h3><p style="color:var(--text-muted);font-size:0.85rem;">واجهة بسيطة وبديهية</p></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">👥</div><h3 style="margin-bottom:8px;font-size:1rem;">تعاون الفريق</h3><p style="color:var(--text-muted);font-size:0.85rem;">اعمل مع فريقك بسلاسة</p></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">📈</div><h3 style="margin-bottom:8px;font-size:1rem;">تقارير ذكية</h3><p style="color:var(--text-muted);font-size:0.85rem;">تحليلات وإحصائيات متقدمة</p></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:28px;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">🔒</div><h3 style="margin-bottom:8px;font-size:1rem;">أمان متقدم</h3><p style="color:var(--text-muted);font-size:0.85rem;">حماية بياناتك على مدار الساعة</p></div></div></div></section>
  <section id="cta" style="padding:80px 0;background:linear-gradient(135deg,var(--primary),var(--primary-light));text-align:center;"><div class="container"><h2 style="font-size:2.5rem;margin-bottom:16px;color:#fff;">جاهز للبدء؟</h2><p style="color:rgba(255,255,255,0.8);font-size:1.125rem;margin-bottom:32px;">ابدأ مجاناً اليوم بدون بطاقة ائتمان</p><a href="#" style="background:#fff;color:var(--primary);padding:14px 40px;border-radius:10px;font-weight:700;display:inline-block;font-size:1.1rem;">ابدأ الآن مجاناً</a></div></section>
  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);"><div class="container">© 2025 AppFlow. جميع الحقوق محفوظة.</div></footer>`
    ),
  },
  {
    id: "personal-site",
    nameEn: "Personal Website",
    nameAr: "موقع شخصي",
    descriptionEn: "A minimal personal website with bio, social links, and a contact section.",
    descriptionAr: "موقع شخصي بسيط مع نبذة وروابط اجتماعية وقسم تواصل.",
    category: "personal",
    files: wrapHtml("موقع شخصي",
      `  --primary: #f59e0b;
  --bg: #09090b;
  --surface: #18181b;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --border: #27272a;`,
      `  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;"><div style="max-width:500px;text-align:center;"><div style="width:120px;height:120px;background:linear-gradient(135deg,var(--primary),#d97706);border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:3rem;">👤</div><h1 style="font-size:2.25rem;margin-bottom:8px;">محمد الأحمد</h1><p style="color:var(--primary);font-size:1.125rem;margin-bottom:16px;">مطور ويب ومصمم تجربة مستخدم</p><p style="color:var(--text-muted);margin-bottom:32px;line-height:1.8;">مرحباً! أنا محمد، مطور ويب شغوف بإنشاء تجارب رقمية مميزة. أعمل على تحويل الأفكار إلى مواقع وتطبيقات جميلة وعملية.</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:40px;"><a href="#" style="background:var(--surface);border:1px solid var(--border);padding:10px 20px;border-radius:10px;color:var(--text);font-size:0.9rem;">GitHub</a><a href="#" style="background:var(--surface);border:1px solid var(--border);padding:10px 20px;border-radius:10px;color:var(--text);font-size:0.9rem;">LinkedIn</a><a href="#" style="background:var(--surface);border:1px solid var(--border);padding:10px 20px;border-radius:10px;color:var(--text);font-size:0.9rem;">Twitter</a><a href="#" style="background:var(--surface);border:1px solid var(--border);padding:10px 20px;border-radius:10px;color:var(--text);font-size:0.9rem;">YouTube</a><a href="#" style="background:var(--surface);border:1px solid var(--border);padding:10px 20px;border-radius:10px;color:var(--text);font-size:0.9rem;">البريد</a></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:right;"><h3 style="margin-bottom:16px;text-align:center;">تواصل معي</h3><form style="display:grid;gap:12px;"><input placeholder="اسمك" style="padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:0.9rem;"><input placeholder="بريدك الإلكتروني" type="email" style="padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:0.9rem;"><textarea placeholder="رسالتك" rows="3" style="padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:0.9rem;resize:vertical;"></textarea><button type="button" style="padding:12px;background:var(--primary);color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;">إرسال</button></form></div></div></div>`
    ),
  },
  {
    id: "saas-landing",
    nameEn: "SaaS Product",
    nameAr: "منتج SaaS",
    descriptionEn: "A modern SaaS product landing page with pricing tiers and feature comparison.",
    descriptionAr: "صفحة منتج SaaS حديثة مع خطط أسعار ومقارنة مميزات.",
    category: "landing",
    files: wrapHtml("منتج SaaS",
      `  --primary: #06b6d4;
  --bg: #0a0a14;
  --surface: #111827;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --border: #1e293b;`,
      `  <header style="padding:16px 0;background:var(--surface);border-bottom:1px solid var(--border);"><div class="container" style="display:flex;justify-content:space-between;align-items:center;"><h1 style="font-size:1.5rem;">💎 <span style="color:var(--primary);">DataSync</span></h1><nav style="display:flex;gap:20px;align-items:center;color:var(--text-muted);"><a href="#features">المميزات</a><a href="#pricing">الأسعار</a><a href="#" style="border:1px solid var(--border);padding:8px 16px;border-radius:8px;">تسجيل دخول</a><a href="#" style="background:var(--primary);color:#000;padding:8px 20px;border-radius:8px;font-weight:600;">ابدأ مجاناً</a></nav></div></header>
  <section style="padding:100px 0;text-align:center;"><div class="container"><h2 style="font-size:3rem;margin-bottom:16px;">مزامنة بياناتك بسهولة</h2><p style="color:var(--text-muted);font-size:1.125rem;max-width:600px;margin:0 auto 40px;">اربط كل قواعد بياناتك وتطبيقاتك في منصة واحدة. مزامنة تلقائية في الوقت الفعلي.</p></div></section>
  <section id="pricing" style="padding:80px 0;"><div class="container" style="text-align:center;"><h2 style="font-size:2.25rem;margin-bottom:48px;">خطط الأسعار</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;max-width:900px;margin:0 auto;"><div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:36px;text-align:center;"><h3 style="font-size:1.25rem;margin-bottom:8px;">مجاني</h3><div style="font-size:2.5rem;font-weight:800;color:var(--primary);margin-bottom:24px;">$0<span style="font-size:1rem;color:var(--text-muted);font-weight:400;">/شهر</span></div><ul style="list-style:none;margin-bottom:28px;"><li style="padding:8px 0;color:var(--text-muted);border-bottom:1px solid var(--border);">✓ 5 قواعد بيانات</li><li style="padding:8px 0;color:var(--text-muted);border-bottom:1px solid var(--border);">✓ 1,000 سجل/شهر</li></ul><button style="width:100%;padding:12px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:10px;font-weight:600;cursor:pointer;">اختر الخطة</button></div><div style="background:var(--surface);border:2px solid var(--primary);border-radius:20px;padding:36px;text-align:center;transform:scale(1.05);"><div style="background:var(--primary);color:#000;padding:4px 16px;border-radius:20px;font-size:0.75rem;font-weight:600;display:inline-block;margin-bottom:12px;">الأكثر طلباً</div><h3 style="font-size:1.25rem;margin-bottom:8px;">احترافي</h3><div style="font-size:2.5rem;font-weight:800;color:var(--primary);margin-bottom:24px;">$29<span style="font-size:1rem;color:var(--text-muted);font-weight:400;">/شهر</span></div><ul style="list-style:none;margin-bottom:28px;"><li style="padding:8px 0;color:var(--text-muted);border-bottom:1px solid var(--border);">✓ 50 قاعدة بيانات</li><li style="padding:8px 0;color:var(--text-muted);border-bottom:1px solid var(--border);">✓ 100,000 سجل/شهر</li></ul><button style="width:100%;padding:12px;background:var(--primary);color:#000;border:1px solid var(--primary);border-radius:10px;font-weight:600;cursor:pointer;">اختر الخطة</button></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:36px;text-align:center;"><h3 style="font-size:1.25rem;margin-bottom:8px;">مؤسسي</h3><div style="font-size:2.5rem;font-weight:800;color:var(--primary);margin-bottom:24px;">$99<span style="font-size:1rem;color:var(--text-muted);font-weight:400;">/شهر</span></div><ul style="list-style:none;margin-bottom:28px;"><li style="padding:8px 0;color:var(--text-muted);border-bottom:1px solid var(--border);">✓ غير محدود</li><li style="padding:8px 0;color:var(--text-muted);border-bottom:1px solid var(--border);">✓ سجلات غير محدودة</li></ul><button style="width:100%;padding:12px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:10px;font-weight:600;cursor:pointer;">اختر الخطة</button></div></div></div></section>
  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);"><div class="container">© 2025 DataSync. جميع الحقوق محفوظة.</div></footer>`
    ),
  },
  {
    id: "real-estate",
    nameEn: "Real Estate",
    nameAr: "عقارات",
    descriptionEn: "A real estate agency website with property listings and search filters.",
    descriptionAr: "موقع وكالة عقارية مع قوائم العقارات وفلاتر البحث.",
    category: "corporate",
    files: wrapHtml("عقارات",
      `  --primary: #22c55e;
  --bg: #0a0a0f;
  --surface: #141418;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --border: #27272a;`,
      `  <header style="background:var(--surface);padding:16px 0;border-bottom:1px solid var(--border);"><div class="container" style="display:flex;justify-content:space-between;align-items:center;"><h1 style="font-size:1.5rem;color:var(--primary);">🏠 دار العقارات</h1><nav style="display:flex;gap:20px;color:var(--text-muted);"><a href="#">الرئيسية</a><a href="#properties">العقارات</a><a href="#">خدماتنا</a><a href="#" style="background:var(--primary);color:#000;padding:8px 20px;border-radius:8px;font-weight:600;">تواصل معنا</a></nav></div></header>
  <section style="padding:80px 0;text-align:center;background:linear-gradient(180deg,var(--surface),var(--bg));"><div class="container"><h2 style="font-size:3rem;margin-bottom:16px;">اعثر على منزل أحلامك</h2><p style="color:var(--text-muted);font-size:1.125rem;margin-bottom:40px;">آلاف العقارات المتاحة في أفضل المواقع</p></div></section>
  <section id="properties" style="padding:80px 0;"><div class="container"><h2 style="font-size:2.25rem;margin-bottom:32px;text-align:center;">عقارات مميزة</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;"><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:180px;background:linear-gradient(135deg,#1a2a1a,#0a1a0a);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">🏡</div><div style="padding:20px;"><h3 style="margin-bottom:4px;">فيلا حديثة</h3><p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">📍 الرياض - حي النرجس</p><div style="display:flex;gap:16px;margin-bottom:16px;color:var(--text-muted);font-size:0.85rem;"><span>🛏️ 5 غرف</span><span>📐 350 م²</span></div><div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:var(--primary);font-weight:700;font-size:1.1rem;">2,500,000 ر.س</span><button style="background:var(--primary);color:#000;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;">التفاصيل</button></div></div></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:180px;background:linear-gradient(135deg,#1a2a1a,#0a1a0a);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">🏢</div><div style="padding:20px;"><h3 style="margin-bottom:4px;">شقة فاخرة</h3><p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">📍 جدة - الكورنيش</p><div style="display:flex;gap:16px;margin-bottom:16px;color:var(--text-muted);font-size:0.85rem;"><span>🛏️ 3 غرف</span><span>📐 180 م²</span></div><div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:var(--primary);font-weight:700;font-size:1.1rem;">850,000 ر.س</span><button style="background:var(--primary);color:#000;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;">التفاصيل</button></div></div></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;"><div style="height:180px;background:linear-gradient(135deg,#1a2a1a,#0a1a0a);display:flex;align-items:center;justify-content:center;font-size:3.5rem;">🌆</div><div style="padding:20px;"><h3 style="margin-bottom:4px;">بنتهاوس</h3><p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">📍 الدمام - الواجهة البحرية</p><div style="display:flex;gap:16px;margin-bottom:16px;color:var(--text-muted);font-size:0.85rem;"><span>🛏️ 4 غرف</span><span>📐 280 م²</span></div><div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:var(--primary);font-weight:700;font-size:1.1rem;">1,800,000 ر.س</span><button style="background:var(--primary);color:#000;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;">التفاصيل</button></div></div></div></div></div></section>
  <footer style="padding:30px 0;text-align:center;color:var(--text-muted);font-size:0.875rem;border-top:1px solid var(--border);"><div class="container">© 2025 دار العقارات. جميع الحقوق محفوظة.</div></footer>`
    ),
  },
];
