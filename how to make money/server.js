/**
 * BASHIMIKI PAUL CHRIS — FULL-STACK BACKEND & 3-INVITE REFERRAL ENGINE (server.js)
 * Node.js + Express / HTTP + SQLite (db.js) with JSON persistence mirror
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { db, JSON_FILE, generateReferralCode } = require('./db');

try { require('dotenv').config(); } catch (e) {}

const PORT = process.env.PORT || 4000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin237';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '237698945916';
const ORANGE_MONEY_NUMBER = process.env.ORANGE_MONEY_NUMBER || '+237 698 945 916 (Bashimiki Paul Chris)';

function loadStore() {
  if (!fs.existsSync(JSON_FILE)) {
    const initial = {
      settings: {
        flashEndsAt: null,
        crunchyrollCost: 1500,
        netflixCost: 1800,
        whatsappNumber: WHATSAPP_NUMBER,
        orangeMoneyNumber: ORANGE_MONEY_NUMBER
      },
      customers: [
        {
          id: 1,
          name: 'Franck Ndongo',
          phone: '+237691223344',
          referral_code: 'FRA-482',
          confirmed_referrals: 2,
          reward_available: 0,
          total_rewards_redeemed: 0,
          created_at: new Date(Date.now() - 28 * 86400000).toISOString()
        },
        {
          id: 2,
          name: 'Junior Kamga',
          phone: '+237677112233',
          referral_code: 'JUN-819',
          confirmed_referrals: 3,
          reward_available: 1,
          total_rewards_redeemed: 1,
          created_at: new Date(Date.now() - 15 * 86400000).toISOString()
        }
      ],
      admin_notifications: [
        {
          id: 1,
          type: 'REWARD_UNLOCKED',
          title: '🏆 3/3 Referrals Completed — Reward Unlocked!',
          message: 'Junior Kamga (JUN-819) hit 3/3 paid referrals! Unlocked -500 FCFA Netflix / -300 FCFA Crunchyroll reward.',
          customer_phone: '+237677112233',
          referral_code: 'JUN-819',
          is_read: 0,
          created_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 2,
          type: 'REFERRAL_PROGRESS',
          title: '📈 Referral Progress: 2/3',
          message: 'Franck Ndongo (FRA-482) reached 2/3 paid referrals (1 more invite needed for reward).',
          customer_phone: '+237691223344',
          referral_code: 'FRA-482',
          is_read: 0,
          created_at: new Date(Date.now() - 7200000).toISOString()
        }
      ],
      orders: [
        {
          id: 1,
          orderCode: 'ORD-1021',
          clientName: 'Franck Ndongo',
          countryCode: '+237',
          phone: '691223344',
          customer_phone: '+237691223344',
          category: 'STREAMING',
          plan: 'netflix',
          planName: 'Netflix (1 Month On Demand)',
          base_price_xaf: 3000,
          discount_xaf: 0,
          final_price_xaf: 3000,
          priceFcfa: 3000,
          referred_by_code: null,
          reward_redeemed: 0,
          referral_code: 'FRA-482',
          status: 'ACTIVE',
          freeNetflixEligible: false,
          freeNetflixClaimed: false,
          accountEmail: 'stream.vip1@bpcstudio.cm',
          accountPin: 'PIN: 4482',
          createdAt: new Date(Date.now() - 28 * 86400000).toISOString(),
          activatedAt: new Date(Date.now() - 28 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 2 * 86400000).toISOString()
        },
        {
          id: 2,
          orderCode: 'ORD-1022',
          clientName: 'Junior Kamga',
          countryCode: '+237',
          phone: '677112233',
          customer_phone: '+237677112233',
          category: 'STREAMING',
          plan: 'crunchyroll',
          planName: 'Crunchyroll (1 Month On Demand)',
          base_price_xaf: 2000,
          discount_xaf: 0,
          final_price_xaf: 2000,
          priceFcfa: 2000,
          referred_by_code: 'FRA-482',
          reward_redeemed: 0,
          referral_code: 'JUN-819',
          status: 'ACTIVE',
          freeNetflixEligible: false,
          freeNetflixClaimed: false,
          accountEmail: 'anime.vip@bpcstudio.cm',
          accountPin: 'PIN: 9012',
          createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
          activatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 20 * 86400000).toISOString()
        }
      ]
    };
    fs.writeFileSync(JSON_FILE, JSON.stringify(initial, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  if (!data.customers) data.customers = [];
  if (!data.admin_notifications) data.admin_notifications = [];
  return data;
}

function saveStore(data) {
  fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));
}

function normalizePhone(countryCode, rawPhone) {
  const cc = (countryCode || '+237').trim();
  const num = String(rawPhone || '').replace(/[^0-9]/g, '');
  return cc.startsWith('+') ? `${cc}${num}` : `+${cc}${num}`;
}

function enrichOrderStatus(order) {
  if ((order.status === 'ACTIVE' || order.status === 'paid') && order.expiresAt) {
    const msLeft = new Date(order.expiresAt).getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / 86400000);
    order.daysRemaining = daysLeft;
    if (msLeft <= 0) order.computedStatus = 'EXPIRED';
    else if (daysLeft <= 3) order.computedStatus = 'EXPIRING_SOON';
    else order.computedStatus = 'ACTIVE';
  } else {
    order.computedStatus = order.status;
    order.daysRemaining = null;
  }
  return order;
}

function handleApi(req, res, parsedUrl, body) {
  const pathname = parsedUrl.pathname;
  const sendJson = (code, obj) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'OPTIONS') return sendJson(200, { ok: true });
  const store = loadStore();

  // 1. GET /api/referrals/validate?code=XXX&plan=netflix|crunchyroll
  if (req.method === 'GET' && pathname === '/api/referrals/validate') {
    const code = (parsedUrl.searchParams.get('code') || '').trim().toUpperCase();
    const plan = (parsedUrl.searchParams.get('plan') || 'netflix').toLowerCase();
    const cust = store.customers.find(c => c.referral_code && c.referral_code.toUpperCase() === code);
    if (!cust) {
      return sendJson(200, { valid: false, message: 'Referral code not found' });
    }
    const isCrunch = plan.includes('crunchy');
    const discountXaf = cust.reward_available === 1 ? (isCrunch ? 300 : 500) : 0;
    return sendJson(200, {
      valid: true,
      code: cust.referral_code,
      ownerName: cust.name,
      ownerPhone: cust.phone,
      confirmedReferrals: cust.confirmed_referrals,
      rewardAvailable: cust.reward_available === 1,
      discountXaf
    });
  }

  // 2. GET /api/orders (Returns orders, customers, notifications & settings)
  if (req.method === 'GET' && pathname === '/api/orders') {
    const enriched = store.orders.map(enrichOrderStatus).sort((a, b) => b.id - a.id);
    return sendJson(200, {
      orders: enriched,
      customers: store.customers,
      notifications: store.admin_notifications,
      settings: store.settings
    });
  }

  // 3. POST /api/orders (Upserts customer, evaluates referral/reward discount, creates pending order)
  if (req.method === 'POST' && pathname === '/api/orders') {
    const clientName = (body.clientName || body.customerName || 'Client VIP').trim();
    const countryCode = body.countryCode || '+237';
    const rawPhone = body.phone || body.customerPhone || '';
    const fullPhone = normalizePhone(countryCode, rawPhone);
    const planName = body.planName || body.plan || 'Netflix (1 Month On Demand)';
    const basePrice = Number(body.basePriceFcfa || body.priceFcfa || 3000);
    const inputCode = (body.promoOrReferralCode || body.referralCodeInput || '').trim().toUpperCase();

    // Upsert Customer (referral_code remains null until first paid order)
    let customer = store.customers.find(c => c.phone === fullPhone);
    if (!customer) {
      customer = {
        id: store.customers.length + 1,
        name: clientName,
        phone: fullPhone,
        referral_code: null,
        confirmed_referrals: 0,
        reward_available: 0,
        total_rewards_redeemed: 0,
        created_at: new Date().toISOString()
      };
      store.customers.push(customer);
    }

    let discountXaf = 0;
    let rewardRedeemed = 0;
    let referredByCode = null;

    if (inputCode) {
      const codeOwner = store.customers.find(c => c.referral_code && c.referral_code.toUpperCase() === inputCode);
      if (codeOwner) {
        const isSelf = (codeOwner.phone === fullPhone) || (body.redeemAsOwner === true);
        if (codeOwner.reward_available === 1 && isSelf) {
          discountXaf = planName.toLowerCase().includes('crunchy') ? 300 : 500;
          rewardRedeemed = 1;
        } else if (codeOwner.phone !== fullPhone) {
          referredByCode = codeOwner.referral_code;
        }
      }
    }

    const finalPrice = Math.max(0, basePrice - discountXaf);
    const nextId = store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1;
    const orderCode = 'ORD-' + (1020 + nextId);

    const newOrder = {
      id: nextId,
      orderCode,
      clientName,
      countryCode,
      phone: rawPhone,
      customer_phone: fullPhone,
      category: body.category || 'STREAMING',
      plan: planName.toLowerCase().includes('crunchy') ? 'crunchyroll' : 'netflix',
      planName,
      base_price_xaf: basePrice,
      discount_xaf: discountXaf,
      final_price_xaf: finalPrice,
      priceFcfa: finalPrice,
      referred_by_code: referredByCode,
      reward_redeemed: rewardRedeemed,
      referral_code: customer.referral_code,
      status: 'PENDING_PAYMENT',
      freeNetflixEligible: Boolean(body.category === 'WEBSITE' || body.freeNetflixEligible),
      freeNetflixClaimed: false,
      accountEmail: '',
      accountPin: '',
      createdAt: new Date().toISOString(),
      activatedAt: null,
      expiresAt: null
    };

    store.orders.push(newOrder);
    saveStore(store);
    return sendJson(201, { success: true, order: enrichOrderStatus(newOrder), customer });
  }

  // 4. PATCH /api/admin/orders/:id/approve OR /api/orders/:id (Atomic Approval + Referral Progression)
  if (req.method === 'PATCH' && (pathname.startsWith('/api/orders/') || pathname.startsWith('/api/admin/orders/'))) {
    const parts = pathname.split('/');
    const id = Number(parts[parts.length - 1] === 'approve' ? parts[parts.length - 2] : parts[parts.length - 1]);
    const order = store.orders.find(o => o.id === id);
    if (!order) return sendJson(404, { error: 'Order not found' });

    const wasAlreadyActive = (order.status === 'ACTIVE' || order.status === 'paid');

    if (body.action === 'ACTIVATE_30_DAYS' || pathname.endsWith('/approve')) {
      const now = new Date();
      order.status = 'ACTIVE';
      order.activatedAt = now.toISOString();
      order.expiresAt = new Date(now.getTime() + 30 * 86400000).toISOString();

      const fullPhone = order.customer_phone || normalizePhone(order.countryCode, order.phone);
      let buyer = store.customers.find(c => c.phone === fullPhone);
      if (!buyer) {
        buyer = {
          id: store.customers.length + 1,
          name: order.clientName,
          phone: fullPhone,
          referral_code: null,
          confirmed_referrals: 0,
          reward_available: 0,
          total_rewards_redeemed: 0,
          created_at: now.toISOString()
        };
        store.customers.push(buyer);
      }

      // A. Generate unique referral_code on first paid order if none exists
      if (!buyer.referral_code) {
        const existingCodes = store.customers.map(c => c.referral_code).filter(Boolean);
        buyer.referral_code = generateReferralCode(buyer.name, existingCodes);
      }
      order.referral_code = buyer.referral_code;

      if (!wasAlreadyActive) {
        // B. If buyer redeemed their 3/3 reward on this order -> Reset counter to 0/3
        if (order.reward_redeemed === 1) {
          buyer.confirmed_referrals = 0;
          buyer.reward_available = 0;
          buyer.total_rewards_redeemed = (buyer.total_rewards_redeemed || 0) + 1;
          store.admin_notifications.unshift({
            id: Date.now(),
            type: 'REWARD_REDEEMED',
            title: `🎁 Loyalty Reward Redeemed (${buyer.referral_code})`,
            message: `${buyer.name} redeemed -${order.discount_xaf} FCFA on ${order.planName}. Counter reset to 0/3.`,
            customer_phone: buyer.phone,
            referral_code: buyer.referral_code,
            is_read: 0,
            created_at: now.toISOString()
          });
        }

        // C. If order had a friend's referred_by_code -> Anti-cheat check & increment referrer
        if (order.referred_by_code) {
          const referrer = store.customers.find(c => c.referral_code === order.referred_by_code);
          if (referrer && referrer.phone !== fullPhone) {
            const duplicatePaidOrders = store.orders.filter(o =>
              o.id !== order.id &&
              (o.status === 'ACTIVE' || o.status === 'paid') &&
              (o.customer_phone === fullPhone) &&
              o.referred_by_code === referrer.referral_code
            );

            if (duplicatePaidOrders.length === 0) {
              referrer.confirmed_referrals = (referrer.confirmed_referrals || 0) + 1;
              if (referrer.confirmed_referrals >= 3) {
                referrer.reward_available = 1;
                store.admin_notifications.unshift({
                  id: Date.now() + 1,
                  type: 'REWARD_UNLOCKED',
                  title: `🏆 3/3 Referrals Unlocked — ${referrer.name} (${referrer.referral_code})`,
                  message: `🏆 ${referrer.name} (${referrer.referral_code}) hit 3/3 paid referrals! Unlocked -500 FCFA Netflix / -300 FCFA Crunchyroll reward.`,
                  customer_phone: referrer.phone,
                  referral_code: referrer.referral_code,
                  is_read: 0,
                  created_at: now.toISOString()
                });
              } else {
                store.admin_notifications.unshift({
                  id: Date.now() + 1,
                  type: 'REFERRAL_PROGRESS',
                  title: `📈 Referral Progress: ${referrer.confirmed_referrals}/3 (${referrer.referral_code})`,
                  message: `${referrer.name} (${referrer.referral_code}) reached ${referrer.confirmed_referrals}/3 paid referrals via friend ${buyer.name}.`,
                  customer_phone: referrer.phone,
                  referral_code: referrer.referral_code,
                  is_read: 0,
                  created_at: now.toISOString()
                });
              }
            }
          }
        }
      }
    }

    if (typeof body.accountEmail === 'string') order.accountEmail = body.accountEmail;
    if (typeof body.accountPin === 'string') order.accountPin = body.accountPin;
    if (typeof body.freeNetflixClaimed === 'boolean') order.freeNetflixClaimed = body.freeNetflixClaimed;

    saveStore(store);
    return sendJson(200, {
      success: true,
      order: enrichOrderStatus(order),
      customers: store.customers,
      notifications: store.admin_notifications
    });
  }

  // 5. GET & PATCH /api/admin/notifications
  if (req.method === 'GET' && pathname === '/api/admin/notifications') {
    return sendJson(200, { notifications: store.admin_notifications, customers: store.customers });
  }
  if (req.method === 'PATCH' && pathname === '/api/admin/notifications/read') {
    store.admin_notifications.forEach(n => { n.is_read = 1; });
    saveStore(store);
    return sendJson(200, { success: true, notifications: store.admin_notifications });
  }

  // 6. POST /api/settings/flash-drop
  if (req.method === 'POST' && pathname === '/api/settings/flash-drop') {
    store.settings.flashEndsAt = body.active ? new Date(Date.now() + 48 * 3600 * 1000).toISOString() : null;
    saveStore(store);
    return sendJson(200, { success: true, settings: store.settings });
  }

  return sendJson(404, { error: 'Endpoint not found' });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  if (parsedUrl.pathname.startsWith('/api/')) {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', () => {
      let body = {};
      try { body = rawBody ? JSON.parse(rawBody) : {}; } catch (e) {}
      handleApi(req, res, parsedUrl, body);
    });
    return;
  }

  let filePath = parsedUrl.pathname === '/' ? path.join(__dirname, 'portfolio.html') : path.join(__dirname, parsedUrl.pathname);
  if (!fs.existsSync(filePath)) filePath = path.join(__dirname, 'portfolio.html');
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); }
    else { res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/html' }); res.end(content); }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 BPC Full-Stack Server & 3-Invite Referral Engine running on http://localhost:${PORT}`);
});
