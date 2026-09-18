const STORAGE_KEY = "arenabet.local.database.v1";

const now = () => new Date().toISOString();
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const seedDatabase = () => ({
  users: [
    {
      id: "demo-user",
      full_name: "Visitante",
      role: "user",
      balance: 1000,
      created_date: now(),
      updated_date: now(),
    },
  ],
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

const publicUser = ({ password: _password, ...user }) => user;

const ensureCurrentUser = (database) => {
  let user = database.users.find((item) => item.id === "demo-user");
  if (!user) {
    user = {
      id: "demo-user",
      full_name: "Visitante",
      role: "user",
      balance: 1000,
      created_date: now(),
      updated_date: now(),
    };
    database.users.push(user);
  }
  return user;
};

const currentUser = () => {
  const database = loadDatabase();
  const existed = database.users.some((item) => item.id === "demo-user");
  const user = ensureCurrentUser(database);
  if (!existed) saveDatabase(database);
  return user;
};

// localStorage has no transaction primitive. Serializing writes in this tab
// keeps balance, match and ledger changes in one snapshot.
let atomicQueue = Promise.resolve();
const atomic = (work) => {
  const run = atomicQueue.then(() => {
    const database = loadDatabase();
    const user = ensureCurrentUser(database);
    const result = work({ database, user, createId, now });
    saveDatabase(database);
    return result;
  });
  atomicQueue = run.catch(() => undefined);
  return run;
};

const auth = {
  async me() {
    return publicUser(currentUser());
  },

  async updateMe(changes) {
    const database = loadDatabase();
    const user = currentUser();
    const index = database.users.findIndex((item) => item.id === user.id);
    database.users[index] = { ...database.users[index], ...changes, id: user.id, updated_date: now() };
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
    const user = currentUser();
    if (["Match", "Transaction"].includes(entityName) && user.role !== "admin") {
      records = records.filter((record) => record.created_by === user.id);
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
    const user = currentUser();
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
