import { supabase } from "@/lib/supabaseClient";

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
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
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
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }

  const database = seedDatabase();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  }
  return database;
};

const saveDatabase = (database) => {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
    } catch {
      // quota or private browsing error
    }
  }
};

const publicUser = (user) => {
  if (!user) return null;
  const { password_hash: _hash, ...safe } = user;
  return {
    ...safe,
    balance: Number(safe.balance ?? 1000),
  };
};

const readSession = () => {
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    }
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    }
    return null;
  } catch {
    return null;
  }
};

const writeSession = (userId) => {
  try {
    if (!userId) {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
      if (typeof localStorage !== "undefined") localStorage.removeItem(SESSION_KEY);
      return;
    }
    const payload = JSON.stringify({ userId });
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SESSION_KEY, payload);
    if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_KEY, payload);
  } catch {
    // noop
  }
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

// Queue to serialize balance mutations safely
let atomicQueue = Promise.resolve();

export const auth = {
  async me() {
    const session = readSession();
    if (!session?.userId) return null;

    try {
      const { data, error } = await supabase
        .from("arenabet_users")
        .select("*")
        .eq("id", session.userId)
        .maybeSingle();

      if (!error && data) {
        // keep local cache updated
        const database = loadDatabase();
        const idx = database.users.findIndex((u) => u.id === data.id);
        if (idx >= 0) database.users[idx] = data;
        else database.users.push(data);
        saveDatabase(database);
        return publicUser(data);
      }
    } catch (e) {
      console.warn("[ArenaBet] Falha ao buscar usuário no Supabase, usando cache:", e);
    }

    // fallback to local cache
    const database = loadDatabase();
    const user = database.users.find((u) => u.id === session.userId);
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

    // Check duplicate in Supabase
    try {
      const { data: existingEmail } = await supabase
        .from("arenabet_users")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (existingEmail) throw new Error("Este e-mail já está cadastrado");

      const { data: existingCpf } = await supabase
        .from("arenabet_users")
        .select("id")
        .eq("cpf", cpfDigits)
        .maybeSingle();
      if (existingCpf) throw new Error("Este CPF já está cadastrado");
    } catch (err) {
      if (err.message?.includes("já está cadastrado")) throw err;
    }

    const password_hash = await hashPassword(password);
    const user = {
      id: createId(),
      full_name: name,
      email: normalizedEmail,
      cpf: cpfDigits,
      phone: phoneDigits,
      birth_date,
      password_hash,
      role: "user",
      balance: 1000,
      created_date: now(),
      updated_date: now(),
    };

    // Save to Supabase
    try {
      const { error: insertError } = await supabase.from("arenabet_users").insert(user);
      if (insertError) {
        if (insertError.message?.includes("email")) throw new Error("Este e-mail já está cadastrado");
        if (insertError.message?.includes("cpf")) throw new Error("Este CPF já está cadastrado");
        console.error("[ArenaBet] Supabase user insert error:", insertError);
      }
    } catch (e) {
      if (e.message?.includes("já está cadastrado")) throw e;
      console.warn("[ArenaBet] Falha ao gravar usuário no Supabase:", e);
    }

    // Also update local cache
    const database = loadDatabase();
    database.users.push(user);
    saveDatabase(database);
    writeSession(user.id);
    return publicUser(user);
  },

  async login(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    // Try Supabase first
    try {
      const { data: user, error } = await supabase
        .from("arenabet_users")
        .select("*")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (!error && user) {
        if (user.password_hash !== passwordHash) {
          throw new Error("E-mail ou senha incorretos");
        }
        writeSession(user.id);
        const database = loadDatabase();
        const idx = database.users.findIndex((u) => u.id === user.id);
        if (idx >= 0) database.users[idx] = user;
        else database.users.push(user);
        saveDatabase(database);
        return publicUser(user);
      }
    } catch (err) {
      if (err.message === "E-mail ou senha incorretos") throw err;
      console.warn("[ArenaBet] Supabase login query falhou, verificando cache:", err);
    }

    // Fallback to local cache
    const database = loadDatabase();
    const user = database.users.find((item) => item.email === normalizedEmail);
    if (!user) throw new Error("E-mail ou senha incorretos");
    if (user.password_hash !== passwordHash) throw new Error("E-mail ou senha incorretos");
    writeSession(user.id);
    return publicUser(user);
  },

  async logout() {
    writeSession(null);
  },

  async updateMe(changes) {
    const session = readSession();
    if (!session?.userId) throw new Error("Faça login para continuar");

    const safeChanges = { ...changes, updated_date: now() };
    delete safeChanges.password_hash;
    delete safeChanges.id;

    let updatedUser = null;

    try {
      const { data, error } = await supabase
        .from("arenabet_users")
        .update(safeChanges)
        .eq("id", session.userId)
        .select()
        .maybeSingle();

      if (!error && data) {
        updatedUser = data;
      }
    } catch (e) {
      console.warn("[ArenaBet] Supabase updateMe falhou:", e);
    }

    const database = loadDatabase();
    const index = database.users.findIndex((item) => item.id === session.userId);
    if (index >= 0) {
      database.users[index] = { ...database.users[index], ...safeChanges, ...(updatedUser || {}) };
      saveDatabase(database);
      return publicUser(database.users[index]);
    }

    if (updatedUser) return publicUser(updatedUser);
    throw new Error("Usuário não encontrado");
  },
};

const entityTableMap = {
  HouseConfig: "arenabet_house_config",
  Match: "arenabet_matches",
  Transaction: "arenabet_transactions",
  User: "arenabet_users",
};

const entityApi = (entityName) => {
  const tableName = entityTableMap[entityName];

  return {
    async list(sort, limit) {
      const session = readSession();
      const currentUserId = session?.userId;

      // Try Supabase first
      if (tableName) {
        try {
          let query = supabase.from(tableName).select("*");

          if (["Match", "Transaction"].includes(entityName)) {
            if (!currentUserId) return [];
            // Admin role check could allow all, otherwise filter by created_by
            const me = await auth.me();
            if (me?.role !== "admin") {
              query = query.eq("created_by", currentUserId);
            }
          }

          if (sort) {
            const descending = sort.startsWith("-");
            const field = descending ? sort.slice(1) : sort;
            query = query.order(field, { ascending: !descending });
          } else {
            query = query.order("created_date", { ascending: false });
          }

          if (limit) {
            query = query.limit(limit);
          }

          const { data, error } = await query;
          if (!error && data) {
            const database = loadDatabase();
            const localRecords = (database.entities[entityName] || []).filter(
              (r) => !data.some((d) => d.id === r.id) && (r.created_by === currentUserId || !currentUserId)
            );
            // Async push unsynced local records to Supabase
            if (localRecords.length > 0) {
              for (const loc of localRecords) {
                const payload = {
                  ...loc,
                  player_id: loc.player_id || loc.created_by,
                  user_id: loc.user_id || loc.created_by,
                };
                supabase.from(tableName).upsert(payload).then();
              }
            }

            const combined = [...data, ...localRecords];
            return combined.map((item) => ({
              ...item,
              amount: item.amount != null ? Number(item.amount) : undefined,
              bet_amount: item.bet_amount != null ? Number(item.bet_amount) : undefined,
              payout: item.payout != null ? Number(item.payout) : undefined,
              house_cut: item.house_cut != null ? Number(item.house_cut) : undefined,
              balance_before: item.balance_before != null ? Number(item.balance_before) : undefined,
              balance_after: item.balance_after != null ? Number(item.balance_after) : undefined,
              rake_percent: item.rake_percent != null ? Number(item.rake_percent) : undefined,
              house_edge_percent: item.house_edge_percent != null ? Number(item.house_edge_percent) : undefined,
              min_bet: item.min_bet != null ? Number(item.min_bet) : undefined,
              max_bet: item.max_bet != null ? Number(item.max_bet) : undefined,
              house_balance: item.house_balance != null ? Number(item.house_balance) : undefined,
            }));
          }
        } catch (e) {
          console.warn(`[ArenaBet] Supabase list ${entityName} falhou, usando cache:`, e);
        }
      }

      // Local fallback
      const database = loadDatabase();
      let records = [...(database.entities[entityName] || [])];
      if (["Match", "Transaction"].includes(entityName)) {
        if (!currentUserId) return [];
        const me = database.users.find((u) => u.id === currentUserId);
        if (me?.role !== "admin") {
          records = records.filter((record) => record.created_by === currentUserId);
        }
      }
      if (sort) {
        const descending = sort.startsWith("-");
        const field = descending ? sort.slice(1) : sort;
        records.sort((left, right) => {
          const res = String(left[field] ?? "").localeCompare(String(right[field] ?? ""), undefined, { numeric: true });
          return descending ? -res : res;
        });
      }
      return limit ? records.slice(0, limit) : records;
    },

    async filter(queryObj = {}, sort, limit) {
      let records = await this.list(sort);
      records = records.filter((record) =>
        Object.entries(queryObj).every(([key, value]) => record[key] === value)
      );
      return limit ? records.slice(0, limit) : records;
    },

    async get(id) {
      if (tableName) {
        try {
          const { data, error } = await supabase.from(tableName).select("*").eq("id", id).maybeSingle();
          if (!error && data) return data;
        } catch {
          // fallback
        }
      }
      const records = await this.list();
      const record = records.find((item) => item.id === id);
      if (!record) throw new Error(`${entityName} não encontrado`);
      return record;
    },

    async create(data) {
      const session = readSession();
      const currentUserId = session?.userId || "anonymous";

      const record = {
        ...data,
        id: data.id || createId(),
        created_by: data.created_by || currentUserId,
        created_date: now(),
        updated_date: now(),
      };

      if (tableName) {
        try {
          const { error } = await supabase.from(tableName).insert(record);
          if (error) console.error(`[ArenaBet] Erro ao criar em ${tableName}:`, error);
        } catch (e) {
          console.warn(`[ArenaBet] Supabase create ${entityName} falhou:`, e);
        }
      }

      const database = loadDatabase();
      database.entities[entityName] ||= [];
      database.entities[entityName].push(record);
      saveDatabase(database);
      return record;
    },

    async update(id, changes) {
      const safeChanges = { ...changes, updated_date: now() };

      if (tableName) {
        try {
          const { error } = await supabase.from(tableName).update(safeChanges).eq("id", id);
          if (error) console.error(`[ArenaBet] Erro ao atualizar em ${tableName}:`, error);
        } catch (e) {
          console.warn(`[ArenaBet] Supabase update ${entityName} falhou:`, e);
        }
      }

      const database = loadDatabase();
      const records = database.entities[entityName] || [];
      const index = records.findIndex((item) => item.id === id);
      if (index >= 0) {
        records[index] = { ...records[index], ...safeChanges, id };
        saveDatabase(database);
        return records[index];
      }
      return { id, ...safeChanges };
    },

    async delete(id) {
      if (tableName) {
        try {
          await supabase.from(tableName).delete().eq("id", id);
        } catch {
          // fallback
        }
      }

      const database = loadDatabase();
      const records = database.entities[entityName] || [];
      database.entities[entityName] = records.filter((item) => item.id !== id);
      saveDatabase(database);
      return { success: true };
    },
  };
};

export const atomic = (work) => {
  const run = atomicQueue.then(async () => {
    const session = readSession();
    if (!session?.userId) throw new Error("Faça login para continuar");

    // Fetch freshest user data from Supabase
    let user = null;
    try {
      const { data, error } = await supabase
        .from("arenabet_users")
        .select("*")
        .eq("id", session.userId)
        .maybeSingle();
      if (!error && data) user = data;
    } catch {
      // fallback
    }

    const database = loadDatabase();
    if (!user) {
      user = database.users.find((u) => u.id === session.userId);
    }
    if (!user) throw new Error("Faça login para continuar");

    const previousBalance = Number(user.balance);

    // Track newly added records to sync them to Supabase
    const initialMatchesLen = (database.entities.Match || []).length;
    const initialTxLen = (database.entities.Transaction || []).length;

    const result = work({ database, user, createId, now });

    // Save to local cache
    const uIdx = database.users.findIndex((u) => u.id === user.id);
    if (uIdx >= 0) database.users[uIdx] = user;
    saveDatabase(database);

    // Sync changes to Supabase asynchronously
    try {
      // 1. Sync user balance
      if (Number(user.balance) !== previousBalance) {
        await supabase
          .from("arenabet_users")
          .update({
            balance: Number(user.balance),
            updated_date: now(),
          })
          .eq("id", user.id);
      }

      // 2. Sync new or modified matches
      const currentMatches = database.entities.Match || [];
      for (let i = initialMatchesLen; i < currentMatches.length; i++) {
        const m = currentMatches[i];
        const matchData = {
          ...m,
          player_id: m.player_id || m.created_by || user.id,
          created_by: m.created_by || m.player_id || user.id,
        };
        await supabase.from("arenabet_matches").upsert(matchData);
      }
      // Also check the settled match if work() updated one
      if (result && typeof result === "object" && result.id && currentMatches.some((m) => m.id === result.id)) {
        const found = currentMatches.find((m) => m.id === result.id);
        if (found) {
          const matchData = {
            ...found,
            player_id: found.player_id || found.created_by || user.id,
            created_by: found.created_by || found.player_id || user.id,
          };
          await supabase.from("arenabet_matches").upsert(matchData);
        }
      }

      // 3. Sync new transactions
      const currentTxs = database.entities.Transaction || [];
      for (let i = initialTxLen; i < currentTxs.length; i++) {
        const t = currentTxs[i];
        const txData = {
          ...t,
          user_id: t.user_id || t.created_by || user.id,
          created_by: t.created_by || t.user_id || user.id,
        };
        await supabase.from("arenabet_transactions").upsert(txData);
      }

      // 4. Sync house config
      const cfg = (database.entities.HouseConfig || [])[0];
      if (cfg) {
        await supabase.from("arenabet_house_config").upsert(cfg);
      }
    } catch (syncError) {
      console.warn("[ArenaBet] Supabase atomic sync:", syncError);
    }

    return result;
  });

  atomicQueue = run.catch(() => undefined);
  return run;
};

const entities = new Proxy({}, {
  get: (_target, entityName) => entityApi(String(entityName)),
});

const roundCredits = (value) => Math.round(Number(value) * 100) / 100;

const updateUserRow = async (userId, changes) => {
  const safe = { ...changes, updated_date: now() };
  delete safe.id;
  delete safe.password_hash;

  let updated = null;
  try {
    const { data, error } = await supabase
      .from("arenabet_users")
      .update(safe)
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (!error && data) updated = data;
  } catch (e) {
    console.warn("[ArenaBet] updateUserRow falhou:", e);
  }

  const database = loadDatabase();
  const idx = database.users.findIndex((u) => u.id === userId);
  if (idx >= 0) {
    database.users[idx] = { ...database.users[idx], ...safe, ...(updated || {}) };
    saveDatabase(database);
    return publicUser(database.users[idx]);
  }
  if (updated) {
    database.users.push(updated);
    saveDatabase(database);
    return publicUser(updated);
  }
  throw new Error("Usuário não encontrado");
};

const requireAdmin = async () => {
  const me = await auth.me();
  if (me?.role !== "admin") throw new Error("Acesso restrito à administração");
  return me;
};

export const admin = {
  async listUsers() {
    await requireAdmin();
    try {
      const { data, error } = await supabase
        .from("arenabet_users")
        .select("id, full_name, email, cpf, phone, birth_date, role, balance, created_date")
        .order("created_date", { ascending: false });
      if (!error && data) {
        return data.map((u) => ({ ...u, balance: Number(u.balance ?? 0) }));
      }
    } catch (e) {
      console.warn("[ArenaBet] admin.listUsers falhou:", e);
    }
    const database = loadDatabase();
    return database.users.map((u) => publicUser(u));
  },

  async setRole(userId, role) {
    await requireAdmin();
    if (!["user", "admin"].includes(role)) throw new Error("Papel inválido");
    return updateUserRow(userId, { role });
  },

  async setBalance(userId, value) {
    await requireAdmin();
    const balance = roundCredits(value);
    if (!Number.isFinite(balance) || balance < 0) throw new Error("Saldo inválido");
    return updateUserRow(userId, { balance });
  },

  async adjustBalance(userId, delta, description = "Ajuste manual da administração") {
    await requireAdmin();
    const amount = roundCredits(delta);
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Informe um valor diferente de zero");

    let current = null;
    try {
      const { data } = await supabase
        .from("arenabet_users")
        .select("balance")
        .eq("id", userId)
        .maybeSingle();
      if (data) current = Number(data.balance ?? 0);
    } catch {
      // fallback below
    }
    if (current == null) {
      const database = loadDatabase();
      const u = database.users.find((x) => x.id === userId);
      current = Number(u?.balance ?? 0);
    }

    const balance_before = roundCredits(current);
    const balance_after = roundCredits(balance_before + amount);
    if (balance_after < 0) throw new Error("O ajuste deixaria o saldo negativo");

    await updateUserRow(userId, { balance: balance_after });

    const tx = {
      id: createId(),
      user_id: userId,
      created_by: userId,
      type: amount > 0 ? "deposit" : "withdrawal",
      amount,
      method: "admin",
      status: "completed",
      description,
      balance_before,
      balance_after,
      created_date: now(),
      updated_date: now(),
    };
    try {
      await supabase.from("arenabet_transactions").insert(tx);
    } catch (e) {
      console.warn("[ArenaBet] admin.adjustBalance tx falhou:", e);
    }
    const database = loadDatabase();
    database.entities.Transaction ||= [];
    database.entities.Transaction.push(tx);
    saveDatabase(database);

    return balance_after;
  },
};

export const db = {
  auth,
  admin,
  atomic,
  entities,
};

export default db;
