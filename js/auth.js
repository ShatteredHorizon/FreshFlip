const SUPABASE_URL = 'https://ghaojptkyxxvxdzmdzpk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoYW9qcHRreXh4dnhkem1kenBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDMyNDgsImV4cCI6MjA5MjcxOTI0OH0.mQ9QoyIj_3iF7T9hWZ5y8iMv_bDMgoTIcDjR-4S3Dpk';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Session = {
  KEY: 'ff_session',
  
  async init() {
    this.loadFromStorage();
    if (this.isLoggedIn()) {
      await this.refreshUser();
    }
  },
  
  loadFromStorage() {
    const stored = localStorage.getItem(this.KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.user && data.user.id) {
          this.setUser(data);
        }
      } catch (e) {}
    }
  },
  
  setUser(data) {
    window.currentUser = data.user;
    window.balance = data.balance;
    window.WIN_CHANCE = data.winChance || 0.5;
  },
  
  async login(username, password) {
    const { data, error } = await sb.from('users').select('*').eq('username', username).maybeSingle();
    if (error) throw new Error('DB error: ' + error.message);
    if (!data) throw new Error('Username not found.');
    
    const ok = await verifyPassword(password, data.password);
    if (!ok) throw new Error('Wrong password.');
    
    await loadSettings();
    
    const sessionData = {
      user: data,
      balance: data.balance,
      winChance: window.WIN_CHANCE
    };
    localStorage.setItem(this.KEY, JSON.stringify(sessionData));
    this.setUser(sessionData);
    
    window.currentUser = data;
    window.balance = data.balance;
    
    return data;
  },
  
  async signup(username, password, referralCode = '') {
    const hash = await hashPassword(password);
    let referrerId = null;
    
    if (referralCode) {
      const { data: refData } = await sb.from('users').select('id').eq('referral_code', referralCode).maybeSingle();
      if (refData && refData.id !== window.currentUser?.id) {
        referrerId = refData.id;
      }
    }
    
    const { data, error } = await sb.from('users').insert({ 
      username: username, 
      password: hash, 
      balance: 1000,
      referred_by: referrerId
    }).select().maybeSingle();
    
    if (error) {
      if (error.code === '23505') throw new Error('Username already taken.');
      throw new Error('Error: ' + error.message);
    }
    
    if (referrerId) {
      const { data: refUser } = await sb.from('users').select('balance').eq('id', referrerId).maybeSingle();
      if (refUser) {
        await sb.from('users').update({ balance: refUser.balance + 100000 }).eq('id', referrerId);
      }
    }
    
    return this.login(username, password);
  },
  
  async generateReferralCode() {
    if (!window.currentUser) return null;
    const code = 'FF' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await sb.from('users').update({ referral_code: code }).eq('id', window.currentUser.id);
    window.currentUser.referral_code = code;
    const stored = JSON.parse(localStorage.getItem(this.KEY) || '{}');
    stored.user.referral_code = code;
    localStorage.setItem(this.KEY, JSON.stringify(stored));
    return code;
  },
  
  async logout() {
    window.currentUser = null;
    window.balance = 0;
    localStorage.removeItem(this.KEY);
    const path = window.location.pathname;
    const isGames = path.includes('/games/');
    window.location.href = isGames ? '../login.html' : 'login.html';
  },
  
  async saveBalance() {
    if (!window.currentUser) return;
    await sb.from('users').update({ balance: window.balance }).eq('id', window.currentUser.id);
  },
  
  isLoggedIn() {
    return window.currentUser && window.currentUser.id;
  },
  
  async refreshUser() {
    if (!window.currentUser) return;
    const { data } = await sb.from('users').select('*').eq('id', window.currentUser.id).maybeSingle();
    if (data) {
      window.currentUser = data;
      window.balance = data.balance;
      const stored = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      stored.user = data;
      stored.balance = data.balance;
      localStorage.setItem(this.KEY, JSON.stringify(stored));
    }
  },
  
  requireAuth() {
    if (!this.isLoggedIn()) {
      const path = window.location.pathname;
      const isGames = path.includes('/games/');
      window.location.href = isGames ? '../login.html' : 'login.html';
      return false;
    }
    return true;
  }
};

async function loadSettings() {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'win_chance').maybeSingle();
    if (data) window.WIN_CHANCE = parseFloat(data.value);
  } catch (e) {}
}

function biasedWin() {
  return Math.random() < (window.WIN_CHANCE || 0.5);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return btoa(JSON.stringify({ salt: Array.from(salt), hash: Array.from(new Uint8Array(hashBuffer)) }));
}

async function verifyPassword(password, stored) {
  try {
    const { salt, hash } = JSON.parse(atob(stored));
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
    const newHash = Array.from(new Uint8Array(hashBuffer));
    return newHash.every((v, i) => v === hash[i]);
  } catch { return false; }
}

function updateBalanceUI(b) {
  window.balance = Math.max(0, Math.round(b));
  const el = document.getElementById('nav-balance');
  if (el) el.textContent = '$' + window.balance.toLocaleString();
  const el2 = document.getElementById('user-balance');
  if (el2) el2.textContent = '$' + window.balance.toLocaleString();
}

function setBet(id, v) { document.getElementById(id).value = v; }
function halfBet(id) {
  const v = parseFloat(document.getElementById(id).value) || 0;
  document.getElementById(id).value = Math.max(1, Math.floor(v / 2));
}
function doubleBet(id) {
  const v = parseFloat(document.getElementById(id).value) || 0;
  document.getElementById(id).value = Math.floor(v * 2);
}
function getBet(id) { return Math.floor(parseFloat(document.getElementById(id).value) || 0); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showResult(prefix, win, amount, msg) {
  const box = document.getElementById(prefix + '-result');
  box.className = 'result-box ' + (win ? 'win' : 'lose');
  document.getElementById(prefix + '-result-amount').textContent = (win ? '+' : '-') + '$' + Math.abs(amount).toLocaleString();
  document.getElementById(prefix + '-result-msg').textContent = msg;
}

if (typeof window !== 'undefined') {
  window.Session = Session;
  window.loadSettings = loadSettings;
  window.biasedWin = biasedWin;
  window.hashPassword = hashPassword;
  window.verifyPassword = verifyPassword;
  window.updateBalanceUI = updateBalanceUI;
  window.setBet = setBet;
  window.halfBet = halfBet;
  window.doubleBet = doubleBet;
  window.getBet = getBet;
  window.sleep = sleep;
  window.showResult = showResult;
}