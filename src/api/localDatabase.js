const STORAGE_KEY = "arenabet.local.database.v1";
const SESSION_KEY = "arenabet.session.v1";

const now = () => new Date().toISOString();
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const seedDatabase = () => ({
  users: [],
  entities: {
    HouseConfig: [
      {
        id: "house-config",
        label: "Principal",
        rake_percent: 10,
        house_edge_percent: 15,
        min_bet: 10,
        max_bet: 1000,
        house_balance: 0,
        created_date: now(),
        updated_date: now(),
      },
    ],
    Match: [],
    Transaction: [],
    User: [],
  },
});

const loadDatabase = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const database = JSON.parse(stored);
      database.users ||= [];
      database.entities ||= {};
      database.entities.HouseConfig ||= [];
      database.entities.Match ||= [];
      database.entities.Transaction ||= [];
      database.entities.User ||= [];
      return database;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const database = seedDatabase();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  return database;
};

const saveDatabase = (database) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
};

const publicUser = ({ password_hash: _passwordHash, ...user }) => user;

const readSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
};

const writeSession = (userId) => {
  if (!userId) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
};

const getCurrentUser = (database = loadDatabase()) => {
  const session = readSession();
  if (!session?.userId) return null;
  return database.users.find((item) => item.id === session.userId) || null;
};

const requireUser = (database) => {
  const user = getCurrentUser(database);
  if (!user) throw new Error("Faça login para continuar");
  return user;
};

const hashPassword = async (password) => {
  const data = new TextEncoder().encode(`arenabet.v1:${password}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

const isValidCpf = (value) => {
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

const isAdult = (birthDate) => {
  if (!birthDate) return false;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return birth.toISOString().slice(0, 10) <= cutoff.toISOString().slice(0, 10);
};

let atomicQueue = Promise.resolve();
const atomic = (work) => {
  const run = atomicQueue.then(() => {
    const database = loadDatabase();
    const user = requireUser(database);
    const result = work({ database, user, createId, now });
    saveDatabase(database);
    return result;
  });
  atomicQueue = run.catch(() => undefined);
  return run;
};

const auth = {
  async me() {
    const user = getCurrentUser();
    return user ? publicUser(user) : null;
  },

  async register({ full_name, email, cpf, phone, birth_date, password }) {
    const name = String(full_name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const cpfDigits = digitsOnly(cpf);
    const phoneDigits = digitsOnly(phone);
    if (name.length < 3) throw new Error("Informe o nome completo");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("E-mail inválido");
    if (!isValidCpf(cpfDigits)) throw new Error("CPF inválido");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) throw new Error("Telefone inválido");
    if (!isAdult(birth_date)) throw new Error("Cadastro permitido apenas para maiores de 18 anos");
    if (String(password || "").length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres");

    const database = loadDatabase();
    if (database.users.some((item) => item.email === normalizedEmail)) throw new Error("Este e-mail já está cadastrado");
    if (database.users.some((item) => item.cpf === cpfDigits)) throw new Error("Este CPF já está cadastrado");

    const user = {
      id: createId(),
      full_name: name,
      email: normalizedEmail,
      cpf: cpfDigits,
      phone: phoneDigits,
      birth_date,
      password_hash: await hashPassword(password),
      role: "user",
      balance: 1000,
      created_date: now(),
      updated_date: now(),
    };
    database.users.push(user);
    saveDatabase(database);
    writeSession(user.id);
    return publicUser(user);
  },

  async login(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const database = loadDatabase();
    const user = database.users.find((item) => item.email === normalizedEmail);
    if (!user) throw new Error("E-mail ou senha incorretos");
    const passwordHash = await hashPassword(password);
    if (user.password_hash !== passwordHash) throw new Error("E-mail ou senha incorretos");
    writeSession(user.id);
    return publicUser(user);
  },

  async logout() {
    writeSession(null);
  },

  async updateMe(changes) {
    const database = loadDatabase();
    const user = requireUser(database);
    const index = database.users.findIndex((item) => item.id === user.id);
    const next = { ...database.users[index], ...changes, id: user.id, updated_date: now() };
    delete next.password_hash;
    next.password_hash = database.users[index].password_hash;
    database.users[index] = next;
    saveDatabase(database);
    return publicUser(database.users[index]);
  },
};

const sortRecords = (records, sort) => {
  if (!sort) return records;
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  return [...records].sort((left, right) => {
    const result = String(left[field] ?? "").localeCompare(String(right[field] ?? ""), undefined, { numeric: true });
    return descending ? -result : result;
  });
};

const entityApi = (entityName) => ({
  async list(sort, limit) {
    const database = loadDatabase();
    let records = [...(database.entities[entityName] || [])];
    const user = getCurrentUser(database);
    if (["Match", "Transaction"].includes(entityName)) {
      if (!user) return [];
      if (user.role !== "admin") {
        records = records.filter((record) => record.created_by === user.id);
      }
    }
    records = sortRecords(records, sort);
    return limit ? records.slice(0, limit) : records;
  },

  async filter(query = {}, sort, limit) {
    let records = await this.list(sort);
    records = records.filter((record) => Object.entries(query).every(([key, value]) => record[key] === value));
    return limit ? records.slice(0, limit) : records;
  },

  async get(id) {
    const record = (await this.list()).find((item) => item.id === id);
    if (!record) throw new Error(`${entityName} não encontrado`);
    return record;
  },

  async create(data) {
    const database = loadDatabase();
    database.entities[entityName] ||= [];
    const user = requireUser(database);
    const record = {
      ...data,
      id: createId(),
      created_by: user.id,
      created_date: now(),
      updated_date: now(),
    };
    database.entities[entityName].push(record);
    saveDatabase(database);
    return record;
  },

  async update(id, changes) {
    const database = loadDatabase();
    const records = database.entities[entityName] || [];
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`${entityName} não encontrado`);
    records[index] = { ...records[index], ...changes, id, updated_date: now() };
    saveDatabase(database);
    return records[index];
  },

  async delete(id) {
    const database = loadDatabase();
    const records = database.entities[entityName] || [];
    database.entities[entityName] = records.filter((item) => item.id !== id);
    saveDatabase(database);
    return { success: true };
  },
});

const entities = new Proxy({}, {
  get: (_target, entityName) => entityApi(String(entityName)),
});

export const db = {
  auth,
  atomic,
  entities,
};

export const localDatabase = db;
export default db;
