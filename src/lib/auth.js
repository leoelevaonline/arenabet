import db from "@/api/localDatabase";

export const AUTH_EVENT = "arenabet-auth";

export const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

export const formatCpf = (value) => {
  const digits = digitsOnly(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

export const formatPhone = (value) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
};

export const isValidCpf = (value) => {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let first = (sum * 10) % 11;
  if (first === 10) first = 0;
  if (first !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  let second = (sum * 10) % 11;
  if (second === 10) second = 0;
  return second === Number(cpf[10]);
};

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

export const isValidPhone = (value) => {
  const digits = digitsOnly(value);
  return digits.length === 10 || digits.length === 11;
};

export const adultCutoffDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
};

export const isAdult = (birthDate) => {
  if (!birthDate) return false;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  return birth.toISOString().slice(0, 10) <= adultCutoffDate();
};

export const notifyAuth = () => {
  window.dispatchEvent(new Event(AUTH_EVENT));
};

export async function getCurrentUser() {
  return db.auth.me();
}

export async function registerAccount(payload) {
  const user = await db.auth.register(payload);
  notifyAuth();
  return user;
}

export async function loginAccount(email, password) {
  const user = await db.auth.login(email, password);
  notifyAuth();
  return user;
}

export async function logoutAccount() {
  await db.auth.logout();
  notifyAuth();
}

export function subscribeAuth(callback) {
  const handler = () => { callback(); };
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
