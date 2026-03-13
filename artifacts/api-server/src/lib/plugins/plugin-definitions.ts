export interface PluginDefinition {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: "forms" | "media" | "social" | "marketing" | "content" | "utility";
  icon: string;
  previewHtml: string;
  codeHtml: string;
  codeCss: string;
  codeJs: string;
}

export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    id: "contact-form",
    nameEn: "Contact Form",
    nameAr: "نموذج تواصل",
    descriptionEn: "A responsive contact form with name, email, and message fields with validation.",
    descriptionAr: "نموذج تواصل متجاوب مع حقول الاسم والبريد الإلكتروني والرسالة مع التحقق.",
    category: "forms",
    icon: "📬",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:24px;font-family:system-ui;background:#f8fafc;border-radius:12px"><h3 style="margin:0 0 16px;color:#1e293b">Contact Us</h3><input placeholder="Your Name" style="width:100%;padding:10px;margin-bottom:8px;border:1px solid #e2e8f0;border-radius:8px;box-sizing:border-box"/><input placeholder="Email" style="width:100%;padding:10px;margin-bottom:8px;border:1px solid #e2e8f0;border-radius:8px;box-sizing:border-box"/><textarea placeholder="Message" rows="3" style="width:100%;padding:10px;margin-bottom:12px;border:1px solid #e2e8f0;border-radius:8px;box-sizing:border-box;resize:vertical"></textarea><button style="width:100%;padding:10px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600">Send Message</button></div>`,
    codeHtml: `<section id="plugin-contact-form" class="plugin-contact-form">
  <div class="contact-container">
    <h2 class="contact-title">Contact Us</h2>
    <form id="contactForm" class="contact-form" onsubmit="handleContactSubmit(event)">
      <div class="form-group">
        <label for="contact-name">Name</label>
        <input type="text" id="contact-name" name="name" required placeholder="Your name" />
      </div>
      <div class="form-group">
        <label for="contact-email">Email</label>
        <input type="email" id="contact-email" name="email" required placeholder="your@email.com" />
      </div>
      <div class="form-group">
        <label for="contact-subject">Subject</label>
        <input type="text" id="contact-subject" name="subject" placeholder="Subject" />
      </div>
      <div class="form-group">
        <label for="contact-message">Message</label>
        <textarea id="contact-message" name="message" required rows="5" placeholder="Your message..."></textarea>
      </div>
      <button type="submit" class="contact-submit">Send Message</button>
      <div id="contact-status" class="contact-status" style="display:none"></div>
    </form>
  </div>
</section>`,
    codeCss: `.plugin-contact-form{padding:60px 20px;background:#f8fafc}.contact-container{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.06)}.contact-title{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 24px;text-align:center}.form-group{margin-bottom:16px}.form-group label{display:block;margin-bottom:6px;font-size:14px;font-weight:500;color:#475569}.form-group input,.form-group textarea{width:100%;padding:12px 16px;border:1px solid #e2e8f0;border-radius:10px;font-size:15px;transition:border-color .2s;box-sizing:border-box;font-family:inherit}.form-group input:focus,.form-group textarea:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}.form-group textarea{resize:vertical}.contact-submit{width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;transition:background .2s}.contact-submit:hover{background:#2563eb}.contact-status{margin-top:12px;padding:12px;border-radius:8px;text-align:center;font-size:14px}`,
    codeJs: `function handleContactSubmit(e){e.preventDefault();const status=document.getElementById('contact-status');const form=e.target;const name=form.querySelector('#contact-name').value;const email=form.querySelector('#contact-email').value;if(!name||!email){status.style.display='block';status.style.background='#fef2f2';status.style.color='#dc2626';status.textContent='Please fill in all required fields.';return}status.style.display='block';status.style.background='#f0fdf4';status.style.color='#16a34a';status.textContent='Thank you! Your message has been sent successfully.';form.reset();setTimeout(()=>{status.style.display='none'},4000)}`,
  },
  {
    id: "google-map",
    nameEn: "Google Map",
    nameAr: "خريطة Google",
    descriptionEn: "An embedded Google Maps widget to show your business location.",
    descriptionAr: "خريطة Google مدمجة لعرض موقع عملك.",
    category: "utility",
    icon: "📍",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:16px;font-family:system-ui"><div style="background:#e2e8f0;border-radius:12px;height:200px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:14px">📍 Google Maps Embed</div></div>`,
    codeHtml: `<section id="plugin-google-map" class="plugin-google-map">
  <div class="map-container">
    <h2 class="map-title">Find Us</h2>
    <div class="map-wrapper">
      <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3624.674937417!2d46.6753!3d24.7136!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjTCsDQyJzQ5LjAiTiA0NsKwNDAnMzEuMSJF!5e0!3m2!1sen!2ssa!4v1" width="100%" height="400" style="border:0;border-radius:12px" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
  </div>
</section>`,
    codeCss: `.plugin-google-map{padding:60px 20px;background:#fff}.map-container{max-width:900px;margin:0 auto}.map-title{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 24px;text-align:center}.map-wrapper{border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}`,
    codeJs: ``,
  },
  {
    id: "image-gallery",
    nameEn: "Image Gallery",
    nameAr: "معرض صور",
    descriptionEn: "A responsive image gallery with lightbox preview and smooth animations.",
    descriptionAr: "معرض صور متجاوب مع معاينة مكبرة وحركات سلسة.",
    category: "media",
    icon: "🖼️",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:16px;font-family:system-ui"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"><div style="background:#dbeafe;border-radius:8px;aspect-ratio:1;display:flex;align-items:center;justify-content:center">🖼️</div><div style="background:#fce7f3;border-radius:8px;aspect-ratio:1;display:flex;align-items:center;justify-content:center">🖼️</div><div style="background:#d1fae5;border-radius:8px;aspect-ratio:1;display:flex;align-items:center;justify-content:center">🖼️</div><div style="background:#fef3c7;border-radius:8px;aspect-ratio:1;display:flex;align-items:center;justify-content:center">🖼️</div><div style="background:#e0e7ff;border-radius:8px;aspect-ratio:1;display:flex;align-items:center;justify-content:center">🖼️</div><div style="background:#fecaca;border-radius:8px;aspect-ratio:1;display:flex;align-items:center;justify-content:center">🖼️</div></div></div>`,
    codeHtml: `<section id="plugin-image-gallery" class="plugin-image-gallery">
  <div class="gallery-container">
    <h2 class="gallery-title">Gallery</h2>
    <div class="gallery-grid">
      <div class="gallery-item" onclick="openLightbox(this)"><img src="https://picsum.photos/seed/g1/400/400" alt="Gallery 1" loading="lazy"/></div>
      <div class="gallery-item" onclick="openLightbox(this)"><img src="https://picsum.photos/seed/g2/400/400" alt="Gallery 2" loading="lazy"/></div>
      <div class="gallery-item" onclick="openLightbox(this)"><img src="https://picsum.photos/seed/g3/400/400" alt="Gallery 3" loading="lazy"/></div>
      <div class="gallery-item" onclick="openLightbox(this)"><img src="https://picsum.photos/seed/g4/400/400" alt="Gallery 4" loading="lazy"/></div>
      <div class="gallery-item" onclick="openLightbox(this)"><img src="https://picsum.photos/seed/g5/400/400" alt="Gallery 5" loading="lazy"/></div>
      <div class="gallery-item" onclick="openLightbox(this)"><img src="https://picsum.photos/seed/g6/400/400" alt="Gallery 6" loading="lazy"/></div>
    </div>
  </div>
  <div id="lightbox" class="lightbox" onclick="closeLightbox()">
    <span class="lightbox-close">&times;</span>
    <img id="lightbox-img" src="" alt="Preview" />
  </div>
</section>`,
    codeCss: `.plugin-image-gallery{padding:60px 20px;background:#f8fafc}.gallery-container{max-width:900px;margin:0 auto}.gallery-title{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 24px;text-align:center}.gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}.gallery-item{border-radius:12px;overflow:hidden;cursor:pointer;transition:transform .3s,box-shadow .3s}.gallery-item:hover{transform:translateY(-4px);box-shadow:0 8px 32px rgba(0,0,0,.12)}.gallery-item img{width:100%;height:100%;object-fit:cover;aspect-ratio:1;display:block}.lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;justify-content:center;align-items:center;cursor:pointer}.lightbox.active{display:flex}.lightbox img{max-width:90%;max-height:90%;border-radius:8px;object-fit:contain}.lightbox-close{position:absolute;top:20px;right:30px;font-size:36px;color:#fff;cursor:pointer;z-index:10000}`,
    codeJs: `function openLightbox(el){const img=el.querySelector('img');document.getElementById('lightbox-img').src=img.src;document.getElementById('lightbox').classList.add('active');document.body.style.overflow='hidden'}function closeLightbox(){document.getElementById('lightbox').classList.remove('active');document.body.style.overflow=''}document.addEventListener('keydown',function(e){if(e.key==='Escape')closeLightbox()})`,
  },
  {
    id: "live-chat",
    nameEn: "Live Chat Widget",
    nameAr: "شات مباشر",
    descriptionEn: "A floating chat widget for real-time customer communication.",
    descriptionAr: "أداة محادثة عائمة للتواصل المباشر مع العملاء.",
    category: "social",
    icon: "💬",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:16px;font-family:system-ui;position:relative;height:200px"><div style="position:absolute;bottom:16px;right:16px;width:56px;height:56px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;box-shadow:0 4px 16px rgba(59,130,246,.4);cursor:pointer">💬</div></div>`,
    codeHtml: `<div id="plugin-live-chat" class="chat-widget">
  <div id="chat-window" class="chat-window" style="display:none">
    <div class="chat-header">
      <span>Live Chat</span>
      <button onclick="toggleChat()" class="chat-close">&times;</button>
    </div>
    <div id="chat-messages" class="chat-messages">
      <div class="chat-msg bot">Hi! How can we help you today?</div>
    </div>
    <div class="chat-input-area">
      <input type="text" id="chat-input" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendChatMsg()" />
      <button onclick="sendChatMsg()" class="chat-send">Send</button>
    </div>
  </div>
  <button id="chat-toggle" class="chat-toggle-btn" onclick="toggleChat()">💬</button>
</div>`,
    codeCss: `.chat-widget{position:fixed;bottom:24px;right:24px;z-index:9990;font-family:system-ui}.chat-toggle-btn{width:60px;height:60px;border-radius:50%;background:#3b82f6;border:none;font-size:28px;cursor:pointer;box-shadow:0 4px 20px rgba(59,130,246,.4);transition:transform .2s}.chat-toggle-btn:hover{transform:scale(1.1)}.chat-window{position:absolute;bottom:70px;right:0;width:340px;height:440px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow:hidden}.chat-header{background:#3b82f6;color:#fff;padding:14px 18px;font-weight:600;display:flex;justify-content:space-between;align-items:center}.chat-close{background:none;border:none;color:#fff;font-size:22px;cursor:pointer}.chat-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}.chat-msg{padding:10px 14px;border-radius:12px;font-size:14px;max-width:80%;line-height:1.4}.chat-msg.bot{background:#f1f5f9;color:#334155;align-self:flex-start}.chat-msg.user{background:#3b82f6;color:#fff;align-self:flex-end}.chat-input-area{display:flex;padding:12px;border-top:1px solid #e2e8f0;gap:8px}.chat-input-area input{flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;outline:none}.chat-input-area input:focus{border-color:#3b82f6}.chat-send{padding:10px 18px;background:#3b82f6;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px}`,
    codeJs: `function toggleChat(){const w=document.getElementById('chat-window');w.style.display=w.style.display==='none'?'flex':'none'}function sendChatMsg(){const input=document.getElementById('chat-input');const msg=input.value.trim();if(!msg)return;const msgs=document.getElementById('chat-messages');const userDiv=document.createElement('div');userDiv.className='chat-msg user';userDiv.textContent=msg;msgs.appendChild(userDiv);input.value='';msgs.scrollTop=msgs.scrollHeight;setTimeout(()=>{const botDiv=document.createElement('div');botDiv.className='chat-msg bot';botDiv.textContent='Thanks for your message! We will get back to you shortly.';msgs.appendChild(botDiv);msgs.scrollTop=msgs.scrollHeight},1000)}`,
  },
  {
    id: "social-share",
    nameEn: "Social Share Buttons",
    nameAr: "أزرار مشاركة اجتماعية",
    descriptionEn: "Share buttons for Twitter, Facebook, LinkedIn, and WhatsApp.",
    descriptionAr: "أزرار مشاركة عبر تويتر وفيسبوك ولينكد إن وواتساب.",
    category: "social",
    icon: "🔗",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:24px;font-family:system-ui;text-align:center"><p style="color:#64748b;margin-bottom:12px;font-size:14px">Share this page</p><div style="display:flex;gap:10px;justify-content:center"><span style="width:44px;height:44px;background:#1da1f2;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px">𝕏</span><span style="width:44px;height:44px;background:#1877f2;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px">f</span><span style="width:44px;height:44px;background:#0a66c2;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px">in</span><span style="width:44px;height:44px;background:#25d366;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px">W</span></div></div>`,
    codeHtml: `<section id="plugin-social-share" class="plugin-social-share">
  <p class="share-label">Share this page</p>
  <div class="share-buttons">
    <a class="share-btn share-twitter" onclick="shareOn('twitter')" title="Share on X/Twitter">𝕏</a>
    <a class="share-btn share-facebook" onclick="shareOn('facebook')" title="Share on Facebook">f</a>
    <a class="share-btn share-linkedin" onclick="shareOn('linkedin')" title="Share on LinkedIn">in</a>
    <a class="share-btn share-whatsapp" onclick="shareOn('whatsapp')" title="Share on WhatsApp">W</a>
  </div>
</section>`,
    codeCss: `.plugin-social-share{padding:40px 20px;text-align:center}.share-label{font-size:14px;color:#64748b;margin-bottom:14px}.share-buttons{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}.share-btn{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;cursor:pointer;transition:transform .2s,box-shadow .2s;text-decoration:none}.share-btn:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.15)}.share-twitter{background:#1da1f2}.share-facebook{background:#1877f2}.share-linkedin{background:#0a66c2}.share-whatsapp{background:#25d366}`,
    codeJs: `function shareOn(platform){const url=encodeURIComponent(window.location.href);const title=encodeURIComponent(document.title);let shareUrl='';switch(platform){case 'twitter':shareUrl='https://twitter.com/intent/tweet?url='+url+'&text='+title;break;case 'facebook':shareUrl='https://www.facebook.com/sharer/sharer.php?u='+url;break;case 'linkedin':shareUrl='https://www.linkedin.com/sharing/share-offsite/?url='+url;break;case 'whatsapp':shareUrl='https://wa.me/?text='+title+'%20'+url;break}if(shareUrl)window.open(shareUrl,'_blank','width=600,height=400')}`,
  },
  {
    id: "countdown-timer",
    nameEn: "Countdown Timer",
    nameAr: "مؤقت عد تنازلي",
    descriptionEn: "A countdown timer for launches, events, or promotions.",
    descriptionAr: "مؤقت عد تنازلي للإطلاقات أو الأحداث أو العروض.",
    category: "marketing",
    icon: "⏱️",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:24px;font-family:system-ui;text-align:center;background:linear-gradient(135deg,#1e293b,#334155);border-radius:16px;color:white"><p style="font-size:14px;opacity:.7;margin-bottom:12px">Launching In</p><div style="display:flex;gap:12px;justify-content:center"><div style="background:rgba(255,255,255,.1);padding:12px 16px;border-radius:10px;min-width:54px"><div style="font-size:24px;font-weight:700">07</div><div style="font-size:10px;opacity:.6">DAYS</div></div><div style="background:rgba(255,255,255,.1);padding:12px 16px;border-radius:10px;min-width:54px"><div style="font-size:24px;font-weight:700">14</div><div style="font-size:10px;opacity:.6">HOURS</div></div><div style="background:rgba(255,255,255,.1);padding:12px 16px;border-radius:10px;min-width:54px"><div style="font-size:24px;font-weight:700">32</div><div style="font-size:10px;opacity:.6">MIN</div></div><div style="background:rgba(255,255,255,.1);padding:12px 16px;border-radius:10px;min-width:54px"><div style="font-size:24px;font-weight:700">58</div><div style="font-size:10px;opacity:.6">SEC</div></div></div></div>`,
    codeHtml: `<section id="plugin-countdown" class="plugin-countdown">
  <div class="countdown-container">
    <h2 class="countdown-label">Launching In</h2>
    <div class="countdown-boxes">
      <div class="countdown-box"><span id="cd-days">00</span><small>Days</small></div>
      <div class="countdown-box"><span id="cd-hours">00</span><small>Hours</small></div>
      <div class="countdown-box"><span id="cd-minutes">00</span><small>Minutes</small></div>
      <div class="countdown-box"><span id="cd-seconds">00</span><small>Seconds</small></div>
    </div>
  </div>
</section>`,
    codeCss: `.plugin-countdown{padding:60px 20px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;text-align:center}.countdown-container{max-width:600px;margin:0 auto}.countdown-label{font-size:22px;font-weight:600;margin:0 0 24px;opacity:.85}.countdown-boxes{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}.countdown-box{background:rgba(255,255,255,.1);backdrop-filter:blur(10px);padding:20px 24px;border-radius:14px;min-width:80px}.countdown-box span{display:block;font-size:36px;font-weight:700;line-height:1}.countdown-box small{font-size:12px;opacity:.6;text-transform:uppercase;margin-top:4px;display:block}`,
    codeJs: `(function(){const target=new Date();target.setDate(target.getDate()+7);function updateCountdown(){const now=new Date();let diff=target-now;if(diff<0)diff=0;const d=Math.floor(diff/864e5);const h=Math.floor((diff%864e5)/36e5);const m=Math.floor((diff%36e5)/6e4);const s=Math.floor((diff%6e4)/1e3);document.getElementById('cd-days').textContent=String(d).padStart(2,'0');document.getElementById('cd-hours').textContent=String(h).padStart(2,'0');document.getElementById('cd-minutes').textContent=String(m).padStart(2,'0');document.getElementById('cd-seconds').textContent=String(s).padStart(2,'0')}updateCountdown();setInterval(updateCountdown,1000)})();`,
  },
  {
    id: "announcement-bar",
    nameEn: "Announcement Bar",
    nameAr: "شريط إعلانات",
    descriptionEn: "A top sticky bar for announcements, offers, or important notices.",
    descriptionAr: "شريط علوي ثابت للإعلانات والعروض أو الملاحظات المهمة.",
    category: "marketing",
    icon: "📢",
    previewHtml: `<div style="max-width:400px;margin:0 auto;font-family:system-ui"><div style="background:linear-gradient(90deg,#3b82f6,#8b5cf6);color:white;padding:10px 16px;text-align:center;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:8px">🎉 Special offer! Get 20% off — Use code WELCOME20 <span style="opacity:.6;cursor:pointer;margin-left:8px">×</span></div></div>`,
    codeHtml: `<div id="plugin-announcement-bar" class="announcement-bar">
  <div class="announcement-content">
    <span>🎉 Special offer! Get 20% off — Use code <strong>WELCOME20</strong></span>
    <button class="announcement-close" onclick="this.parentElement.parentElement.style.display='none'">&times;</button>
  </div>
</div>`,
    codeCss: `.announcement-bar{background:linear-gradient(90deg,#3b82f6,#8b5cf6);color:#fff;padding:12px 20px;text-align:center;position:sticky;top:0;z-index:999;font-size:14px;font-weight:500}.announcement-content{display:flex;align-items:center;justify-content:center;gap:12px;max-width:1200px;margin:0 auto}.announcement-close{background:none;border:none;color:#fff;font-size:22px;cursor:pointer;opacity:.7;transition:opacity .2s;padding:0 4px;line-height:1}.announcement-close:hover{opacity:1}`,
    codeJs: ``,
  },
  {
    id: "faq-accordion",
    nameEn: "FAQ Accordion",
    nameAr: "الأسئلة الشائعة",
    descriptionEn: "An expandable FAQ section with smooth accordion animation.",
    descriptionAr: "قسم أسئلة شائعة قابل للتوسيع مع حركة أكورديون سلسة.",
    category: "content",
    icon: "❓",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:16px;font-family:system-ui"><div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden"><div style="padding:12px 16px;font-weight:600;font-size:14px;color:#1e293b;display:flex;justify-content:space-between;cursor:pointer">What is your return policy? <span>+</span></div></div><div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden"><div style="padding:12px 16px;font-weight:600;font-size:14px;color:#1e293b;display:flex;justify-content:space-between;cursor:pointer">How do I track my order? <span>+</span></div></div><div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden"><div style="padding:12px 16px;font-weight:600;font-size:14px;color:#1e293b;display:flex;justify-content:space-between;cursor:pointer">Do you offer support? <span>+</span></div></div></div>`,
    codeHtml: `<section id="plugin-faq" class="plugin-faq">
  <div class="faq-container">
    <h2 class="faq-title">Frequently Asked Questions</h2>
    <div class="faq-list">
      <div class="faq-item">
        <button class="faq-question" onclick="toggleFaq(this)"><span>What is your return policy?</span><span class="faq-icon">+</span></button>
        <div class="faq-answer"><p>We offer a 30-day return policy for all unused items in their original packaging. Contact our support team to initiate a return.</p></div>
      </div>
      <div class="faq-item">
        <button class="faq-question" onclick="toggleFaq(this)"><span>How do I track my order?</span><span class="faq-icon">+</span></button>
        <div class="faq-answer"><p>Once your order ships, you'll receive an email with a tracking number. You can also check the status in your account dashboard.</p></div>
      </div>
      <div class="faq-item">
        <button class="faq-question" onclick="toggleFaq(this)"><span>Do you offer international shipping?</span><span class="faq-icon">+</span></button>
        <div class="faq-answer"><p>Yes! We ship to over 50 countries worldwide. Shipping rates and delivery times vary by location.</p></div>
      </div>
      <div class="faq-item">
        <button class="faq-question" onclick="toggleFaq(this)"><span>How can I contact support?</span><span class="faq-icon">+</span></button>
        <div class="faq-answer"><p>You can reach us via email at support@example.com or through our live chat widget during business hours.</p></div>
      </div>
      <div class="faq-item">
        <button class="faq-question" onclick="toggleFaq(this)"><span>Do you have a loyalty program?</span><span class="faq-icon">+</span></button>
        <div class="faq-answer"><p>Yes! Join our rewards program to earn points on every purchase and redeem them for exclusive discounts.</p></div>
      </div>
    </div>
  </div>
</section>`,
    codeCss: `.plugin-faq{padding:60px 20px;background:#fff}.faq-container{max-width:700px;margin:0 auto}.faq-title{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 24px;text-align:center}.faq-item{border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;overflow:hidden;transition:box-shadow .2s}.faq-item:hover{box-shadow:0 2px 12px rgba(0,0,0,.04)}.faq-question{width:100%;padding:16px 20px;background:none;border:none;font-size:15px;font-weight:600;color:#1e293b;cursor:pointer;display:flex;justify-content:space-between;align-items:center;text-align:start;font-family:inherit}.faq-icon{font-size:20px;color:#94a3b8;transition:transform .3s}.faq-item.active .faq-icon{transform:rotate(45deg)}.faq-answer{max-height:0;overflow:hidden;transition:max-height .3s ease}.faq-item.active .faq-answer{max-height:200px}.faq-answer p{padding:0 20px 16px;margin:0;font-size:14px;color:#64748b;line-height:1.6}`,
    codeJs: `function toggleFaq(btn){const item=btn.closest('.faq-item');const wasActive=item.classList.contains('active');document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('active'));if(!wasActive)item.classList.add('active')}`,
  },
  {
    id: "testimonials",
    nameEn: "Testimonials",
    nameAr: "شهادات العملاء",
    descriptionEn: "A testimonials carousel showcasing customer reviews with ratings.",
    descriptionAr: "عرض شهادات العملاء مع التقييمات في شريط متحرك.",
    category: "content",
    icon: "⭐",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:20px;font-family:system-ui;background:#f8fafc;border-radius:16px"><div style="text-align:center"><div style="font-size:24px;margin-bottom:8px">⭐⭐⭐⭐⭐</div><p style="font-size:13px;color:#475569;font-style:italic;margin-bottom:12px">"Absolutely amazing service! Highly recommend to everyone."</p><div style="display:flex;align-items:center;justify-content:center;gap:8px"><div style="width:36px;height:36px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:700">S</div><div><p style="font-size:13px;font-weight:600;color:#1e293b;margin:0">Sarah Ahmed</p><p style="font-size:11px;color:#94a3b8;margin:0">CEO, TechCorp</p></div></div></div></div>`,
    codeHtml: `<section id="plugin-testimonials" class="plugin-testimonials">
  <div class="testimonials-container">
    <h2 class="testimonials-title">What Our Clients Say</h2>
    <div class="testimonials-grid">
      <div class="testimonial-card">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-text">"Absolutely amazing service! They exceeded all our expectations and delivered on time."</p>
        <div class="testimonial-author"><div class="testimonial-avatar">S</div><div><strong>Sarah Ahmed</strong><span>CEO, TechCorp</span></div></div>
      </div>
      <div class="testimonial-card">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-text">"Professional team with great attention to detail. Our website looks incredible!"</p>
        <div class="testimonial-author"><div class="testimonial-avatar" style="background:#8b5cf6">M</div><div><strong>Mohammed Ali</strong><span>Founder, StartupX</span></div></div>
      </div>
      <div class="testimonial-card">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-text">"Outstanding quality and fast turnaround. Would definitely work with them again!"</p>
        <div class="testimonial-author"><div class="testimonial-avatar" style="background:#10b981">L</div><div><strong>Layla Hassan</strong><span>Marketing Director</span></div></div>
      </div>
    </div>
  </div>
</section>`,
    codeCss: `.plugin-testimonials{padding:60px 20px;background:#f8fafc}.testimonials-container{max-width:1000px;margin:0 auto}.testimonials-title{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 32px;text-align:center}.testimonials-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.testimonial-card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 16px rgba(0,0,0,.05);transition:transform .2s}.testimonial-card:hover{transform:translateY(-4px)}.testimonial-stars{color:#f59e0b;font-size:18px;margin-bottom:12px}.testimonial-text{font-size:14px;color:#475569;line-height:1.6;font-style:italic;margin:0 0 16px}.testimonial-author{display:flex;align-items:center;gap:12px}.testimonial-avatar{width:42px;height:42px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0}.testimonial-author strong{display:block;font-size:14px;color:#1e293b}.testimonial-author span{font-size:12px;color:#94a3b8}`,
    codeJs: ``,
  },
  {
    id: "newsletter",
    nameEn: "Newsletter Signup",
    nameAr: "نشرة بريدية",
    descriptionEn: "An email newsletter subscription form with validation.",
    descriptionAr: "نموذج اشتراك في النشرة البريدية مع التحقق.",
    category: "marketing",
    icon: "✉️",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:24px;font-family:system-ui;background:linear-gradient(135deg,#eff6ff,#f0fdf4);border-radius:16px;text-align:center"><h3 style="color:#1e293b;margin:0 0 6px;font-size:18px">Stay Updated</h3><p style="color:#64748b;font-size:13px;margin:0 0 16px">Get the latest news and updates in your inbox.</p><div style="display:flex;gap:8px"><input placeholder="Enter your email" style="flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px"/><button style="padding:10px 18px;background:#3b82f6;color:white;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap">Subscribe</button></div></div>`,
    codeHtml: `<section id="plugin-newsletter" class="plugin-newsletter">
  <div class="newsletter-container">
    <h2 class="newsletter-title">Stay Updated</h2>
    <p class="newsletter-desc">Subscribe to our newsletter for the latest news, tips, and exclusive offers.</p>
    <form class="newsletter-form" onsubmit="handleNewsletterSubmit(event)">
      <input type="email" id="newsletter-email" placeholder="Enter your email address" required />
      <button type="submit">Subscribe</button>
    </form>
    <p id="newsletter-status" class="newsletter-status" style="display:none"></p>
  </div>
</section>`,
    codeCss: `.plugin-newsletter{padding:60px 20px;background:linear-gradient(135deg,#eff6ff,#f0fdf4)}.newsletter-container{max-width:500px;margin:0 auto;text-align:center}.newsletter-title{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 8px}.newsletter-desc{font-size:15px;color:#64748b;margin:0 0 24px;line-height:1.5}.newsletter-form{display:flex;gap:10px;max-width:420px;margin:0 auto}.newsletter-form input{flex:1;padding:14px 18px;border:1px solid #e2e8f0;border-radius:12px;font-size:15px;outline:none;transition:border-color .2s}.newsletter-form input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}.newsletter-form button{padding:14px 24px;background:#3b82f6;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .2s}.newsletter-form button:hover{background:#2563eb}.newsletter-status{margin-top:12px;font-size:14px}@media(max-width:480px){.newsletter-form{flex-direction:column}.newsletter-form button{width:100%}}`,
    codeJs: `function handleNewsletterSubmit(e){e.preventDefault();const email=document.getElementById('newsletter-email').value;const status=document.getElementById('newsletter-status');if(!email){status.style.display='block';status.style.color='#dc2626';status.textContent='Please enter a valid email.';return}status.style.display='block';status.style.color='#16a34a';status.textContent='Thank you for subscribing! 🎉';e.target.reset();setTimeout(()=>{status.style.display='none'},4000)}`,
  },
  {
    id: "pricing-table",
    nameEn: "Pricing Table",
    nameAr: "جدول الأسعار",
    descriptionEn: "A responsive pricing table with plan comparison and CTA buttons.",
    descriptionAr: "جدول أسعار متجاوب مع مقارنة الخطط وأزرار الاشتراك.",
    category: "content",
    icon: "💰",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:16px;font-family:system-ui"><div style="display:flex;gap:8px"><div style="flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center"><p style="font-weight:600;color:#1e293b;font-size:14px;margin:0 0 4px">Basic</p><p style="font-size:22px;font-weight:700;color:#3b82f6;margin:0">$9<span style="font-size:12px;color:#94a3b8">/mo</span></p></div><div style="flex:1;background:#3b82f6;border-radius:12px;padding:16px;text-align:center;color:white"><p style="font-weight:600;font-size:14px;margin:0 0 4px">Pro</p><p style="font-size:22px;font-weight:700;margin:0">$29<span style="font-size:12px;opacity:.7">/mo</span></p></div></div></div>`,
    codeHtml: `<section id="plugin-pricing" class="plugin-pricing">
  <div class="pricing-container">
    <h2 class="pricing-title">Choose Your Plan</h2>
    <div class="pricing-grid">
      <div class="pricing-card">
        <h3>Starter</h3>
        <div class="pricing-price">$9<span>/month</span></div>
        <ul class="pricing-features">
          <li>✓ 1 Project</li>
          <li>✓ Basic Support</li>
          <li>✓ 5GB Storage</li>
          <li>✗ Custom Domain</li>
        </ul>
        <button class="pricing-btn">Get Started</button>
      </div>
      <div class="pricing-card featured">
        <div class="pricing-badge">Most Popular</div>
        <h3>Professional</h3>
        <div class="pricing-price">$29<span>/month</span></div>
        <ul class="pricing-features">
          <li>✓ 10 Projects</li>
          <li>✓ Priority Support</li>
          <li>✓ 50GB Storage</li>
          <li>✓ Custom Domain</li>
        </ul>
        <button class="pricing-btn">Get Started</button>
      </div>
      <div class="pricing-card">
        <h3>Enterprise</h3>
        <div class="pricing-price">$99<span>/month</span></div>
        <ul class="pricing-features">
          <li>✓ Unlimited Projects</li>
          <li>✓ Dedicated Support</li>
          <li>✓ 500GB Storage</li>
          <li>✓ Custom Domain</li>
        </ul>
        <button class="pricing-btn">Contact Us</button>
      </div>
    </div>
  </div>
</section>`,
    codeCss: `.plugin-pricing{padding:60px 20px;background:#f8fafc}.pricing-container{max-width:1000px;margin:0 auto}.pricing-title{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 32px;text-align:center}.pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;align-items:start}.pricing-card{background:#fff;border-radius:16px;padding:32px 28px;text-align:center;border:1px solid #e2e8f0;transition:transform .2s,box-shadow .2s;position:relative}.pricing-card:hover{transform:translateY(-4px)}.pricing-card.featured{border-color:#3b82f6;box-shadow:0 8px 32px rgba(59,130,246,.15)}.pricing-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#3b82f6;color:#fff;padding:4px 16px;border-radius:20px;font-size:12px;font-weight:600}.pricing-card h3{font-size:20px;color:#1e293b;margin:0 0 8px}.pricing-price{font-size:42px;font-weight:700;color:#1e293b;margin:0 0 20px}.pricing-price span{font-size:16px;color:#94a3b8;font-weight:400}.pricing-features{list-style:none;padding:0;margin:0 0 24px;text-align:start}.pricing-features li{padding:8px 0;font-size:14px;color:#475569;border-bottom:1px solid #f1f5f9}.pricing-btn{width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s}.pricing-btn:hover{background:#2563eb}`,
    codeJs: ``,
  },
  {
    id: "back-to-top",
    nameEn: "Back to Top Button",
    nameAr: "زر العودة للأعلى",
    descriptionEn: "A smooth scroll-to-top button that appears when scrolling down.",
    descriptionAr: "زر تمرير سلس للأعلى يظهر عند التمرير للأسفل.",
    category: "utility",
    icon: "⬆️",
    previewHtml: `<div style="max-width:400px;margin:0 auto;padding:16px;font-family:system-ui;position:relative;height:100px"><div style="position:absolute;bottom:16px;right:16px;width:44px;height:44px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;box-shadow:0 4px 12px rgba(59,130,246,.3)">↑</div></div>`,
    codeHtml: `<button id="plugin-back-to-top" class="back-to-top-btn" onclick="window.scrollTo({top:0,behavior:'smooth'})" title="Back to top">↑</button>`,
    codeCss: `.back-to-top-btn{position:fixed;bottom:24px;right:24px;width:48px;height:48px;border-radius:50%;background:#3b82f6;color:#fff;border:none;font-size:20px;cursor:pointer;box-shadow:0 4px 16px rgba(59,130,246,.3);opacity:0;visibility:hidden;transition:all .3s;z-index:9980}.back-to-top-btn.visible{opacity:1;visibility:visible}.back-to-top-btn:hover{background:#2563eb;transform:translateY(-2px)}`,
    codeJs: `(function(){const btn=document.getElementById('plugin-back-to-top');if(btn){window.addEventListener('scroll',function(){if(window.scrollY>300){btn.classList.add('visible')}else{btn.classList.remove('visible')}})}})();`,
  },
  {
    id: "cookie-consent",
    nameEn: "Cookie Consent Banner",
    nameAr: "شريط موافقة الكوكيز",
    descriptionEn: "A GDPR-compliant cookie consent banner with accept/decline options.",
    descriptionAr: "شريط موافقة على الكوكيز متوافق مع GDPR مع خيارات القبول والرفض.",
    category: "utility",
    icon: "🍪",
    previewHtml: `<div style="max-width:400px;margin:0 auto;font-family:system-ui"><div style="background:#1e293b;color:white;padding:16px;border-radius:12px;display:flex;align-items:center;gap:12px"><p style="flex:1;font-size:12px;margin:0;opacity:.9">We use cookies to improve your experience. By using our site, you agree to our cookie policy.</p><button style="padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Accept</button></div></div>`,
    codeHtml: `<div id="plugin-cookie-consent" class="cookie-banner" style="display:none">
  <div class="cookie-content">
    <p>🍪 We use cookies to enhance your browsing experience. By continuing to use our site, you consent to our use of cookies.</p>
    <div class="cookie-actions">
      <button class="cookie-accept" onclick="acceptCookies()">Accept All</button>
      <button class="cookie-decline" onclick="declineCookies()">Decline</button>
    </div>
  </div>
</div>`,
    codeCss: `.cookie-banner{position:fixed;bottom:0;left:0;right:0;background:#1e293b;color:#fff;padding:18px 24px;z-index:9999;box-shadow:0 -4px 24px rgba(0,0,0,.2)}.cookie-content{max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:20px;flex-wrap:wrap}.cookie-content p{flex:1;margin:0;font-size:14px;line-height:1.5;min-width:250px;opacity:.9}.cookie-actions{display:flex;gap:10px;flex-shrink:0}.cookie-accept{padding:10px 22px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s}.cookie-accept:hover{background:#2563eb}.cookie-decline{padding:10px 22px;background:rgba(255,255,255,.1);color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;transition:background .2s}.cookie-decline:hover{background:rgba(255,255,255,.2)}`,
    codeJs: `(function(){if(!localStorage.getItem('cookie-consent')){const banner=document.getElementById('plugin-cookie-consent');if(banner)banner.style.display='block'}})();function acceptCookies(){localStorage.setItem('cookie-consent','accepted');document.getElementById('plugin-cookie-consent').style.display='none'}function declineCookies(){localStorage.setItem('cookie-consent','declined');document.getElementById('plugin-cookie-consent').style.display='none'}`,
  },
];

export function getPluginById(id: string): PluginDefinition | undefined {
  return PLUGIN_DEFINITIONS.find(p => p.id === id);
}

export function getPluginsByCategory(category: string): PluginDefinition[] {
  return PLUGIN_DEFINITIONS.filter(p => p.category === category);
}

export const PLUGIN_CATEGORIES = [
  { id: "all", nameEn: "All", nameAr: "الكل" },
  { id: "forms", nameEn: "Forms", nameAr: "نماذج" },
  { id: "media", nameEn: "Media", nameAr: "وسائط" },
  { id: "social", nameEn: "Social", nameAr: "تواصل" },
  { id: "marketing", nameEn: "Marketing", nameAr: "تسويق" },
  { id: "content", nameEn: "Content", nameAr: "محتوى" },
  { id: "utility", nameEn: "Utility", nameAr: "أدوات" },
] as const;
