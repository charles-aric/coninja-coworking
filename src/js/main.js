(() => {
  const WA_NUMBER = '923275393390';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  /* ---------- Google Analytics 4 (live domain only, so previews don't pollute the data) ---------- */
  const GA_ID = 'G-EWMT0L7CC6';
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); } // gtag.js needs the arguments object, not an array
  if (/(^|\.)coninjacoworking\.com$/.test(window.location.hostname)) {
    gtag('js', new Date());
    gtag('config', GA_ID);
    const ga = document.createElement('script');
    ga.async = true;
    ga.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(ga);
  }

  /* ---------- Mobile menu (full height panel, staggered links) ---------- */
  const toggle = document.querySelector('.nav__toggle');
  const menu = document.getElementById('menu');

  if (toggle && menu) {
    const items = [...menu.querySelectorAll('.menu__links a, .menu__foot > *')];
    items.forEach((el, i) => { el.style.transitionDelay = `${Math.min(i * 60, 340)}ms`; });

    const setMenu = (open) => {
      if (open) menu.hidden = false;
      requestAnimationFrame(() => {
        menu.classList.toggle('is-open', open);
        document.body.classList.toggle('menu-open', open);
      });
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (!open) setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 320);
    };

    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  /* ---------- Current section / page indicator ---------- */
  const navLinks = [...document.querySelectorAll('.nav__links a, .menu__links a')];
  const here = window.location.pathname.replace(/\/$/, '') || '/';
  const linkPath = (a) => new URL(a.href, window.location.href).pathname.replace(/\/$/, '') || '/';

  // Links to other pages (e.g. the landing pages) are marked when you are on them
  navLinks.forEach((a) => {
    if (!new URL(a.href, window.location.href).hash && linkPath(a) === here && here !== '/') {
      a.setAttribute('aria-current', 'page');
    }
  });

  // On the home page, in-page links follow the section in view
  const sections = [...document.querySelectorAll('main > section')];
  if (here === '/' && sections.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id ? `#${entry.target.id}` : null;
        navLinks.forEach((a) => {
          const url = new URL(a.href, window.location.href);
          if (id && url.hash === id && linkPath(a) === '/') a.setAttribute('aria-current', 'true');
          else if (a.getAttribute('aria-current') === 'true') a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  /* ---------- Open or closed, in Islamabad time ---------- */
  const karachiNow = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const h = Number(get('hour')) % 24;
    const m = Number(get('minute'));
    return { day, h, m, mins: h * 60 + m };
  };

  const clock = (h, m) => {
    const suffix = h < 12 ? 'AM' : 'PM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
  };

  // Mon to Fri: 24 hours. Sat: 12 PM to 12:30 AM. Sun: 12 PM to midnight.
  const statusFor = ({ day, mins }) => {
    if (day >= 1 && day <= 5) return { open: true, title: 'Open now', detail: 'Open 24 hours today' };
    if (day === 6) {
      return mins >= 720
        ? { open: true, title: 'Open now', detail: 'Until 12:30 AM tonight' }
        : { open: false, title: 'Closed now', detail: 'Opens today at 12 PM' };
    }
    if (mins < 30) return { open: true, title: 'Open now', detail: 'Until 12:30 AM' };
    if (mins >= 720) return { open: true, title: 'Open now', detail: 'Then 24 hours from Monday' };
    return { open: false, title: 'Closed now', detail: 'Opens today at 12 PM' };
  };

  const statusEls = document.querySelectorAll('[data-status]');
  const dayRows = document.querySelectorAll('[data-days]');
  if (statusEls.length || dayRows.length) {
    const renderStatus = () => {
      const now = karachiNow();
      const s = statusFor(now);
      statusEls.forEach((el) => {
        el.classList.toggle('is-open', s.open);
        el.classList.toggle('is-closed', !s.open);
        const title = el.querySelector('[data-status-title]');
        const detail = el.querySelector('[data-status-detail]');
        if (detail) {
          title.textContent = s.title;
          detail.textContent = `${s.detail}. ${clock(now.h, now.m)} in Islamabad`;
        } else if (title) {
          title.textContent = `${s.title}. ${s.detail}`;
        }
      });
      dayRows.forEach((row) => {
        row.classList.toggle('is-today', row.dataset.days.split(',').map(Number).includes(now.day));
      });
    };
    renderStatus();
    setInterval(renderStatus, 60 * 1000);
  }

  /* ---------- Scroll reveals (once) ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    reveals.forEach((el) => {
      const group = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
      el.style.transitionDelay = `${Math.min(group.indexOf(el), 5) * 80}ms`;
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Tagline: words light up in reading order ---------- */
  const tagline = document.querySelector('[data-reveal-words]');
  if (tagline) {
    const words = [];
    const wrap = (node, accent) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const span = document.createElement('span');
            span.className = accent ? 'w is-accent' : 'w';
            span.textContent = part;
            words.push(span);
            frag.appendChild(span);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const isAccent = child.classList.contains('is-accent');
          child.classList.remove('is-accent');
          wrap(child, accent || isAccent);
        }
      });
    };
    wrap(tagline, false);

    if (reduceMotion) {
      words.forEach((w) => w.classList.add('is-on'));
    } else {
      let lit = 0;
      let ticking = false;
      const update = () => {
        ticking = false;
        const rect = tagline.getBoundingClientRect();
        const vh = window.innerHeight;
        const progress = Math.min(Math.max((vh * 0.85 - rect.top) / (rect.height + vh * 0.35), 0), 1);
        const target = Math.round(progress * words.length);
        if (target > lit) {
          for (let i = lit; i < target; i++) words[i].classList.add('is-on');
          lit = target;
        }
        if (lit >= words.length) window.removeEventListener('scroll', onScroll);
      };
      const onScroll = () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      update();
    }
  }

  /* ---------- Floating WhatsApp: hidden while the first screen is visible ---------- */
  const waFloat = document.querySelector('.wa-float');
  const firstScreen = document.querySelector('.hero, .lp-hero');
  if (waFloat && firstScreen && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      waFloat.classList.toggle('is-hidden', entry.isIntersecting);
    }, { threshold: 0.3 }).observe(firstScreen);
  }

  /* ---------- Lightbox ---------- */
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    const lbImg = lightbox.querySelector('img');
    const lbCap = lightbox.querySelector('figcaption');
    document.querySelectorAll('.shot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const img = btn.querySelector('img');
        lbImg.src = btn.dataset.full;
        lbImg.alt = img.alt;
        lbCap.textContent = img.alt;
        if (typeof lightbox.showModal === 'function') lightbox.showModal();
        else window.open(btn.dataset.full, '_blank', 'noopener');
      });
    });
    lightbox.querySelector('.lightbox__close').addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
  }

  /* ---------- Map: load Google Maps only when asked ---------- */
  document.querySelectorAll('[data-map]').forEach((box) => {
    const btn = box.querySelector('[data-map-load]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = box.dataset.map;
      frame.title = 'Map showing CoNinja Coworking at Professional Arcade, E-11/3, Islamabad';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.allowFullscreen = true;
      box.replaceChildren(frame);
    });
  });

  /* ---------- Team cost calculator ---------- */
  document.querySelectorAll('[data-calc]').forEach((calc) => {
    const rate = Number(calc.dataset.rate) || 0;
    const input = calc.querySelector('[data-calc-input]');
    const seatsOut = calc.querySelector('[data-calc-seats]');
    const totalOut = calc.querySelector('[data-calc-total]');
    const fmt = new Intl.NumberFormat('en-PK');
    const render = () => {
      const seats = Number(input.value);
      seatsOut.textContent = String(seats);
      totalOut.textContent = `PKR ${fmt.format(seats * rate)}`;
    };
    input.addEventListener('input', render);
    render();
  });

  /* ---------- Tour form: validate, then hand off to WhatsApp ---------- */
  const form = document.getElementById('tour-form');
  if (form) {
    const done = form.querySelector('.form__done');
    const dateInput = form.elements.date;
    const now = new Date();
    dateInput.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    const spaceSelect = form.elements.space;
    const allowed = [...spaceSelect.options].map((o) => o.value).filter(Boolean);
    const preset = new URLSearchParams(window.location.search).get('space');
    if (preset && allowed.includes(preset)) spaceSelect.value = preset;

    document.querySelectorAll('[data-space]').forEach((link) => {
      link.addEventListener('click', () => {
        if (allowed.includes(link.dataset.space)) spaceSelect.value = link.dataset.space;
      });
    });

    const checks = {
      name: (v) => v.trim().length > 1,
      phone: (v) => v.replace(/\D/g, '').length >= 10,
      space: (v) => v !== '',
    };

    const validate = (name) => {
      const field = form.elements[name];
      const ok = checks[name](field.value);
      field.closest('.field').classList.toggle('is-invalid', !ok);
      field.setAttribute('aria-invalid', String(!ok));
      return ok;
    };

    Object.keys(checks).forEach((name) => {
      const field = form.elements[name];
      field.addEventListener('blur', () => { if (field.value) validate(name); });
      field.addEventListener('input', () => {
        if (field.closest('.field').classList.contains('is-invalid')) validate(name);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const results = Object.keys(checks).map(validate);
      if (results.includes(false)) {
        form.querySelector('.is-invalid input, .is-invalid select')?.focus();
        done.hidden = true;
        return;
      }

      const v = (n) => form.elements[n].value.trim().slice(0, 120);
      const lines = [
        `Name: ${v('name')}`,
        `Phone: ${v('phone')}`,
        `Looking for: ${v('space')}`,
        `Team size: ${v('team')}`,
        v('date') && `Preferred visit date: ${new Date(`${v('date')}T00:00`).toDateString()}`,
      ].filter(Boolean);
      const text = `Hi CoNinja, I'd like to book a tour.\n\n${lines.join('\n')}`;
      const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

      // No form contents are sent to Analytics, only that a tour request was started
      gtag('event', 'generate_lead', { method: 'whatsapp_tour_form' });

      const win = window.open(url, '_blank');
      if (win) win.opener = null;
      else window.location.href = url;
      done.hidden = false;
    });
  }

  /* ---------- WhatsApp link clicks (bookings are WhatsApp only, so there are no call links) ---------- */
  // One listener covers every wa.me link, including ones on pages written by the SEO automation.
  // Only the page and the link's place on it are sent, never the message text.
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="https://wa.me/"]') : null;
    if (!a) return;
    const place = a.closest('footer') ? 'footer' : a.closest('nav, header') ? 'header' : 'page';
    gtag('event', 'whatsapp_click', { link_location: place, page_path: window.location.pathname });
  });

  /* ---------- Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
