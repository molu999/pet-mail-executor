"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/service-core.ts
var service_core_exports = {};
__export(service_core_exports, {
  CATALOG_VERSION: () => CATALOG_VERSION,
  createRuntime: () => createRuntime,
  remoteDatabase: () => remoteDatabase
});
module.exports = __toCommonJS(service_core_exports);

// ../src/shared/email-recipients.ts
function parseEmailRecipients(value) {
  const recipients = (value ?? "").split(/[;,，；\r\n]+/).map((entry) => {
    const [email, ...notes] = entry.trim().split(/(?:^|\s+)备注[:：]?\s*|\|/);
    return { email: email.trim(), note: notes.join(" ").trim() || void 0 };
  }).filter((entry) => entry.email || entry.note);
  return mergeEmailRecipients(recipients);
}
function mergeEmailRecipients(...groups) {
  const result = /* @__PURE__ */ new Map();
  for (const recipient of groups.flat()) {
    const key2 = recipient.email.trim().toLowerCase();
    const previous = result.get(key2);
    if (!previous) result.set(key2, { email: recipient.email.trim(), note: recipient.note?.trim() || void 0 });
    else if (!previous.note && recipient.note) previous.note = recipient.note.trim();
  }
  return [...result.values()];
}
function serializeEmailRecipients(recipients) {
  return recipients.map(({ email, note }) => `${email.trim()}${note?.trim() ? ` \u5907\u6CE8\uFF1A${note.trim()}` : ""}`).join("\n");
}
function requireEmailRecipients(value, required = false) {
  const recipients = parseEmailRecipients(value);
  const invalid = recipients.filter(({ email }) => !/^[^\s@<>;,，；|]+@[^\s@<>;,，；|]+\.[^\s@<>;,，；|]+$/.test(email));
  if (invalid.length) throw new Error(`\u6536\u4EF6\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E\uFF1A${invalid.map(({ email }) => email || "\uFF08\u7A7A\u90AE\u7BB1\uFF09").join("\u3001")}`);
  if (required && !recipients.length) throw new Error("\u8BF7\u9009\u62E9\u6536\u4EF6\u4EBA");
  return recipients;
}

// ../src/shared/cloud-mail.ts
var CLOUD_PROTOCOL = 1;
function cloudEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("\u8BF7\u586B\u5199\u6709\u6548\u7684 HTTPS \u4E91\u7AEF\u5730\u5740\u3002");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("\u4E91\u7AEF\u5730\u5740\u5FC5\u987B\u662F HTTPS \u6839\u5730\u5740\uFF0C\u4E0D\u80FD\u5305\u542B\u51ED\u636E\u3001\u8DEF\u5F84\u6216\u53C2\u6570\u3002");
  }
  return url.origin;
}
function validateCloudPlan(value) {
  const plan = value;
  if (!plan || typeof plan !== "object" || typeof plan.id !== "string" || !/^feishu:[^\r\n]{1,400}:[^:\r\n]{1,200}$/.test(plan.id) || !Number.isSafeInteger(plan.version) || plan.version < 1 || !plan.event || plan.event.id !== plan.id || plan.event.provider !== "feishu" || plan.event.emailReminderEnabled !== true || !Number.isSafeInteger(plan.leadMs) || plan.leadMs <= 0 || plan.leadMs > 366 * 864e5) throw new Error("\u4E91\u7AEF\u8BA1\u5212\u65E0\u6548\u3002");
  const e = plan.event;
  for (const key2 of ["title", "notes", "location", "emailRecipientNote"]) {
    if (key2 === "title" && !e[key2] || e[key2] !== void 0 && (typeof e[key2] !== "string" || e[key2].length > (key2 === "notes" ? 2e4 : 500))) throw new Error("\u65E5\u7A0B\u5185\u5BB9\u65E0\u6548\u3002");
  }
  const start = Date.parse(e.startsAt);
  if (!Number.isFinite(start) || e.endsAt !== void 0 && (!Number.isFinite(Date.parse(e.endsAt)) || Date.parse(e.endsAt) <= start)) throw new Error("\u65E5\u7A0B\u65F6\u95F4\u65E0\u6548\u3002");
  const recipients = requireEmailRecipients(e.emailRecipients, true);
  if (recipients.length > 50) throw new Error("\u4E91\u7AEF\u5355\u4E2A\u8BA1\u5212\u6700\u591A 50 \u4E2A\u6536\u4EF6\u4EBA\u3002");
  return { id: plan.id, version: plan.version, leadMs: plan.leadMs, event: {
    id: plan.id,
    provider: "feishu",
    title: e.title,
    startsAt: new Date(start).toISOString(),
    endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : void 0,
    location: e.location,
    notes: e.notes,
    emailReminderEnabled: true,
    emailReminderAt: new Date(start - plan.leadMs).toISOString(),
    emailRecipients: serializeEmailRecipients(recipients),
    emailRecipientNote: e.emailRecipientNote
  } };
}
function automaticCloudSend(task, now) {
  return now >= task.dueAt && now - task.dueAt <= 15 * 6e4 && now < Date.parse(task.event.endsAt ?? task.event.startsAt);
}

// ../src/shared/email-preview.ts
function buildEmailPreview(event) {
  const when = new Date(event.startsAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
  const details = [
    `\u65E5\u7A0B\uFF1A${event.title}`,
    `\u5F00\u59CB\u65F6\u95F4\uFF1A${when}`,
    event.location ? `\u5730\u70B9\uFF1A${event.location}` : void 0,
    event.notes ? `\u5907\u6CE8\uFF1A${event.notes}` : void 0
  ].filter(Boolean).join("\n");
  return {
    recipients: requireEmailRecipients(event.emailRecipients, true).map((item) => item.email),
    sendAt: event.emailReminderAt ?? event.remindAt,
    subject: `\u65E5\u7A0B\u63D0\u9192\uFF1A${event.title}`,
    text: `${details}${event.emailRecipientNote ? `

\u6536\u4EF6\u5907\u6CE8\uFF1A${event.emailRecipientNote}` : ""}

\u8FD9\u662F\u4E00\u5C01\u7531 Pet Desktop \u81EA\u52A8\u53D1\u9001\u7684\u65E5\u7A0B\u63D0\u9192\u3002`
  };
}

// src/store.ts
var map = (row) => ({
  id: row.id,
  version: row.version,
  event: JSON.parse(row.event),
  leadMs: row.lead_ms,
  dueAt: row.due_at,
  status: row.status,
  accepted: JSON.parse(row.accepted),
  rejected: JSON.parse(row.rejected),
  error: row.error,
  updatedAt: row.updated_at
});
var CloudStore = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async get(id) {
    const row = await this.db.prepare("SELECT * FROM tasks WHERE id=?").bind(id).first();
    return row ? map(row) : void 0;
  }
  async upsert(plan) {
    const now = Date.now();
    await this.db.prepare(`INSERT INTO tasks (id,version,event,plan,lead_ms,due_at,status,updated_at) VALUES (?,?,?,?,?,?,'pending',?)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version,event=excluded.event,plan=excluded.plan,lead_ms=excluded.lead_ms,
      due_at=excluded.due_at,status='pending',rejected='[]',error=NULL,updated_at=excluded.updated_at,checked_at=0
      WHERE tasks.version < excluded.version AND tasks.status NOT IN ('sending','sent','uncertain','verifying') AND tasks.accepted='[]'`).bind(plan.id, plan.version, JSON.stringify(plan.event), JSON.stringify(plan), plan.leadMs, Date.parse(plan.event.startsAt) - plan.leadMs, now).run();
    const current = await this.get(plan.id);
    const saved = await this.db.prepare("SELECT plan FROM tasks WHERE id=?").bind(plan.id).first();
    return { task: current, ok: saved?.plan === JSON.stringify(plan) };
  }
  async cancel(id, version) {
    await this.db.prepare(`INSERT INTO tasks (id,version,event,plan,lead_ms,due_at,status,updated_at) VALUES (?,?,'{}','{}',0,0,'cancelled',?)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version,status='cancelled',updated_at=excluded.updated_at,error=NULL,claim=NULL
      WHERE tasks.version < excluded.version AND tasks.status NOT IN ('sending','uncertain','sent')`).bind(id, version, Date.now()).run();
    const task = await this.get(id);
    return { task, ok: task.version === version && task.status === "cancelled" };
  }
  async recover(now) {
    await this.db.batch([
      this.db.prepare("UPDATE attempts SET status='uncertain',error='\u53D1\u9001\u4E2D\u65AD\uFF0C\u7ED3\u679C\u5F85\u6838\u5B9E' WHERE status='sending' AND task_id IN (SELECT id FROM tasks WHERE status='sending' AND lease_until<?)").bind(now),
      this.db.prepare("UPDATE tasks SET status='uncertain',error='\u53D1\u9001\u4E2D\u65AD\uFF0C\u7ED3\u679C\u5F85\u6838\u5B9E',claim=NULL WHERE status='sending' AND lease_until<?").bind(now),
      this.db.prepare("UPDATE tasks SET status='pending',claim=NULL WHERE status='verifying' AND lease_until<?").bind(now)
    ]);
  }
  async candidate(now, checkInterval = 15 * 6e4) {
    const row = await this.db.prepare(`SELECT * FROM tasks WHERE status IN ('pending','paused') AND
      ((due_at<=? AND checked_at<=?) OR checked_at<=?) ORDER BY checked_at ASC,due_at ASC LIMIT 1`).bind(now, now - 6e4, now - checkInterval).first();
    return row ? map(row) : void 0;
  }
  async dueCandidate(now) {
    const row = await this.db.prepare(`SELECT * FROM tasks WHERE status IN ('pending','paused') AND due_at<=? AND checked_at<=?
      ORDER BY due_at ASC,checked_at ASC LIMIT 1`).bind(now, now - 6e4).first();
    return row ? map(row) : void 0;
  }
  async claim(task, claim, now) {
    const result = await this.db.prepare("UPDATE tasks SET status='verifying',claim=?,lease_until=? WHERE id=? AND version=? AND status=?").bind(claim, now + 18e4, task.id, task.version, task.status).run();
    return result.meta.changes === 1;
  }
  async update(task, claim, status, error) {
    const nextError = error ?? (["sending", "verifying"].includes(status) && task.error?.startsWith("manual:") ? task.error : null);
    const result = await this.db.prepare(`UPDATE tasks SET event=?,due_at=?,status=?,accepted=?,error=?,updated_at=?,checked_at=?,
      claim=CASE WHEN ? IN ('sending','verifying') THEN claim ELSE NULL END WHERE id=? AND version=? AND claim=?`).bind(JSON.stringify(task.event), task.dueAt, status, JSON.stringify(task.accepted), nextError, Date.now(), Date.now(), status, task.id, task.version, claim).run();
    return result.meta.changes === 1;
  }
  async beginAttempt(task, claim, attempt) {
    await this.db.prepare(`INSERT INTO attempts (id,task_id,version,recipient,title,subject,body,started_at,status,executor_claim)
      SELECT ?,?,?,?,?,?,?,?,'sending',? FROM tasks WHERE id=? AND version=? AND claim=? AND status='sending'`).bind(
      attempt.id,
      task.id,
      task.version,
      attempt.recipients[0],
      attempt.title,
      attempt.subject,
      attempt.text,
      attempt.startedAt,
      claim,
      task.id,
      task.version,
      claim
    ).run();
    return !!await this.db.prepare("SELECT id FROM attempts WHERE id=?").bind(attempt.id).first();
  }
  async finishAttempt(task, claim, attempt, status) {
    const taskError = status === "pending" && task.error?.startsWith("manual:") ? task.error : attempt.error ?? null;
    await this.db.batch([
      this.db.prepare("UPDATE attempts SET status=?,completed_at=?,error=? WHERE id=?").bind(attempt.status, attempt.completedAt, attempt.error ?? null, attempt.id),
      this.db.prepare("UPDATE tasks SET accepted=?,rejected=?,status=?,error=?,updated_at=?,claim=NULL WHERE id=? AND version=? AND claim=?").bind(JSON.stringify(task.accepted), JSON.stringify(task.rejected), status, taskError, Date.now(), task.id, task.version, claim)
    ]);
  }
  async finishExternalAttempt(taskId, version, claim, attemptId, status, error) {
    const row = await this.db.prepare(`SELECT * FROM attempts WHERE id=? AND task_id=? AND version=? AND executor_claim=?`).bind(attemptId, taskId, version, claim).first();
    if (!row) return { ok: false, reason: "\u53D1\u9001\u4EFB\u52A1\u4E0D\u5B58\u5728\u3002" };
    if (row.status !== "sending") return row.status === status && row.error === (error ?? null) ? { ok: true, task: await this.get(taskId) } : { ok: false, reason: "\u6267\u884C\u7ED3\u679C\u4E0E\u5DF2\u4FDD\u5B58\u8BB0\u5F55\u51B2\u7A81\u3002" };
    const current = await this.db.prepare("SELECT * FROM tasks WHERE id=? AND version=? AND claim=? AND status='sending' AND lease_until>?").bind(taskId, version, claim, Date.now()).first();
    if (!current) return { ok: false, reason: "\u53D1\u9001\u79DF\u7EA6\u5DF2\u5931\u6548\uFF0C\u8BF7\u6838\u5B9E\u7ED3\u679C\u3002" };
    const task = map(current);
    const accepted = status === "sent" ? [...task.accepted, row.recipient] : task.accepted;
    const rejected = status === "failed" ? [...task.rejected, row.recipient] : task.rejected;
    const recipients = requireEmailRecipients(task.event.emailRecipients, true);
    const remaining = recipients.some((r) => ![...accepted, ...rejected].some((a) => a.toLowerCase() === r.email.toLowerCase()));
    const nextStatus = status === "uncertain" ? "uncertain" : remaining ? "pending" : rejected.length && accepted.length ? "partial" : rejected.length ? "failed" : "sent";
    const completedAt = (/* @__PURE__ */ new Date()).toISOString();
    const taskError = nextStatus === "pending" && task.error?.startsWith("manual:") ? task.error : error ?? null;
    const result = await this.db.batch([
      this.db.prepare(`UPDATE attempts SET status=?,completed_at=?,error=? WHERE id=? AND status='sending' AND executor_claim=?
        AND EXISTS(SELECT id FROM tasks WHERE id=? AND version=? AND claim=? AND status='sending' AND lease_until>?)`).bind(status, completedAt, error ?? null, attemptId, claim, taskId, version, claim, Date.now()),
      this.db.prepare(`UPDATE tasks SET accepted=?,rejected=?,status=?,error=?,updated_at=?,checked_at=0,claim=NULL
        WHERE id=? AND version=? AND claim=? AND status='sending' AND EXISTS(SELECT id FROM attempts WHERE id=? AND executor_claim=? AND status=? AND completed_at=?)`).bind(JSON.stringify(accepted), JSON.stringify(rejected), nextStatus, taskError, Date.now(), taskId, version, claim, attemptId, claim, status, completedAt)
    ]);
    return result[0]?.meta?.changes === 1 ? { ok: true, task: await this.get(taskId) } : { ok: false, reason: "\u53D1\u9001\u4EFB\u52A1\u5DF2\u88AB\u5176\u4ED6\u6267\u884C\u5668\u5904\u7406\u3002" };
  }
  async attempts(id, before) {
    const rows = (await this.db.prepare("SELECT * FROM attempts WHERE task_id=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT 30").bind(id, before ?? null, before ?? null).all()).results;
    return rows.map((r) => ({
      id: r.id,
      eventId: r.task_id,
      title: r.title,
      recipients: [r.recipient],
      accepted: r.status === "sent" ? [r.recipient] : [],
      rejected: r.status === "failed" ? [r.recipient] : [],
      subject: r.subject,
      text: r.body,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      status: r.status,
      error: r.error
    }));
  }
  async act(id, version, action, duplicate, requestId) {
    if (requestId) {
      if (await this.db.prepare("SELECT id FROM relay_actions WHERE id=?").bind(requestId).first()) return true;
      await this.db.batch([
        this.db.prepare("INSERT OR IGNORE INTO relay_actions(id) SELECT ? FROM tasks WHERE id=? AND version=? AND status IN ('failed','partial','awaiting_confirmation','uncertain') AND (status!='uncertain' OR ?=1)").bind(requestId, id, version, duplicate ? 1 : 0),
        this.db.prepare("UPDATE tasks SET status=?,checked_at=0,rejected='[]',error=?,updated_at=? WHERE id=? AND version=? AND status IN ('failed','partial','awaiting_confirmation','uncertain') AND (status!='uncertain' OR ?=1) AND EXISTS(SELECT id FROM relay_actions WHERE id=?)").bind(action === "skip" ? "skipped" : "pending", action === "send" ? `manual:${Date.now() + 30 * 6e4}` : null, Date.now(), id, version, duplicate ? 1 : 0, requestId)
      ]);
      return !!await this.db.prepare("SELECT id FROM relay_actions WHERE id=?").bind(requestId).first();
    }
    const result = await this.db.prepare("UPDATE tasks SET status=?,checked_at=0,rejected='[]',error=?,updated_at=? WHERE id=? AND version=? AND status IN ('failed','partial','awaiting_confirmation','uncertain') AND (status!='uncertain' OR ?=1)").bind(action === "skip" ? "skipped" : "pending", action === "send" ? `manual:${Date.now() + 18e4}` : null, Date.now(), id, version, duplicate ? 1 : 0).run();
    return result.meta.changes === 1;
  }
};

// src/engine.ts
var SafeCloudFailure = class extends Error {
  constructor(message, definite = false) {
    super(message);
    this.definite = definite;
  }
  definite;
};
function refreshCloudTask(task, live) {
  task.event = { ...task.event, title: live.title, startsAt: live.startsAt, endsAt: live.endsAt, notes: live.notes, location: live.location };
  task.dueAt = Date.parse(live.startsAt) - task.leadMs;
  task.event.emailReminderAt = new Date(task.dueAt).toISOString();
}
async function runCloudTick(store, dependencies, now = Date.now()) {
  await store.recover(now);
  const task = await store.candidate(now, dependencies.futureCheckInterval);
  if (!task) return;
  const claim = crypto.randomUUID();
  if (!await store.claim(task, claim, now)) return;
  let started = false;
  try {
    const first = await dependencies.event(task.id);
    if (!first) {
      await store.update(task, claim, "cancelled");
      return;
    }
    refreshCloudTask(task, first);
    if (task.dueAt > now) {
      await store.update(task, claim, "pending");
      return;
    }
    const manualUntil = task.error?.startsWith("manual:") ? Number(task.error.slice(7)) : 0;
    if (!automaticCloudSend(task, now) && manualUntil < now) {
      await store.update(task, claim, "awaiting_confirmation", "\u5DF2\u9519\u8FC7\u53D1\u9001\u65F6\u95F4\u6216\u65E5\u7A0B\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u786E\u8BA4\u8865\u53D1\u6216\u8DF3\u8FC7\u3002");
      return;
    }
    const recipients = requireEmailRecipients(task.event.emailRecipients, true).map((r) => r.email);
    const remaining = recipients.filter((r) => ![...task.accepted, ...task.rejected].some((a) => a.toLowerCase() === r.toLowerCase()));
    if (!remaining.length) {
      await store.update(task, claim, task.rejected.length ? task.accepted.length ? "partial" : "failed" : "sent");
      return;
    }
    await dependencies.beforeSend?.(task.id, task.version);
    const live = await dependencies.event(task.id);
    if (!live) {
      await store.update(task, claim, "cancelled");
      return;
    }
    refreshCloudTask(task, live);
    const submitNow = Date.now();
    if (task.dueAt > submitNow) {
      await store.update(task, claim, "pending");
      return;
    }
    if (!automaticCloudSend(task, submitNow) && manualUntil < submitNow) {
      await store.update(task, claim, "awaiting_confirmation", "\u53D1\u9001\u524D\u65E5\u7A0B\u65F6\u95F4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u3002");
      return;
    }
    if (!await store.update(task, claim, "sending")) return;
    const preview = buildEmailPreview(task.event);
    const attempt = {
      id: `${(/* @__PURE__ */ new Date()).toISOString()}_${crypto.randomUUID()}`,
      eventId: task.id,
      title: task.event.title,
      recipients: [remaining[0]],
      accepted: [],
      rejected: [],
      subject: preview.subject,
      text: preview.text,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: "sending"
    };
    if (!await store.beginAttempt(task, claim, attempt)) return;
    started = true;
    try {
      await dependencies.send(remaining[0], preview.subject, preview.text);
      task.accepted.push(remaining[0]);
      attempt.accepted = [remaining[0]];
      attempt.status = "sent";
    } catch (error) {
      attempt.status = error instanceof SafeCloudFailure && error.definite ? "failed" : "uncertain";
      if (attempt.status === "failed") {
        attempt.rejected = [remaining[0]];
        task.rejected.push(remaining[0]);
      }
      attempt.error = error instanceof SafeCloudFailure ? error.message : "SMTP \u63D0\u4EA4\u4E2D\u65AD\uFF0C\u53D1\u9001\u7ED3\u679C\u5F85\u6838\u5B9E\u3002";
    }
    attempt.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    const status = attempt.status === "uncertain" ? "uncertain" : remaining.length > 1 ? "pending" : task.rejected.length ? task.accepted.length ? "partial" : "failed" : "sent";
    await store.finishAttempt(task, claim, attempt, status);
  } catch (error) {
    await store.update(task, claim, started ? "uncertain" : "paused", started ? "\u53D1\u9001\u7ED3\u679C\u5F85\u6838\u5B9E\u3002" : error instanceof SafeCloudFailure ? error.message : "\u65E5\u7A0B\u6838\u5B9E\u5931\u8D25\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002");
  }
}

// node-only:socket-disabled
function connect() {
  throw new Error("WORKER_SMTP_DISABLED");
}

// src/smtp.ts
var SmtpFailure = class extends Error {
  constructor(phase, code) {
    super(`SMTP ${phase}${code ? ` ${code}` : ""}`);
    this.phase = phase;
    this.code = code;
  }
  phase;
  code;
};
var bytes = (value) => new TextEncoder().encode(value);
async function timed(promise, phase) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new SmtpFailure(phase)), 1e4);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function base64(value) {
  let text = "";
  for (let i = 0; i < value.length; i += 8192) text += String.fromCharCode(...value.slice(i, i + 8192));
  return btoa(text);
}
var encodeHeader = (value) => `=?UTF-8?B?${base64(bytes(value))}?=`;
var SmtpSession = class {
  constructor(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }
  socket;
  reader;
  writer;
  buffer = "";
  capabilities = "";
  async readReply(phase) {
    const lines = [];
    for (; ; ) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) {
        const next = await timed(this.reader.read(), phase);
        if (next.done) throw new SmtpFailure(phase);
        this.buffer += new TextDecoder().decode(next.value, { stream: true });
        continue;
      }
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      lines.push(line);
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match) throw new SmtpFailure(phase);
      if (match[2] === " ") return { code: Number(match[1]), text: lines.join("\n") };
    }
  }
  async command(value, phase, expected = [2, 3]) {
    await this.writer.write(bytes(`${value}\r
`));
    const reply = await this.readReply(phase);
    if (!expected.includes(Math.floor(reply.code / 100))) throw new SmtpFailure(phase, reply.code);
    return reply;
  }
  async initialize(user, password) {
    const greeting = await this.readReply("greeting");
    if (Math.floor(greeting.code / 100) !== 2) throw new SmtpFailure("greeting", greeting.code);
    const ehlo = await this.command("EHLO 127.0.0.1", "ehlo");
    this.capabilities = ehlo.text;
    const auth = /(?:^|\n)250[ -]AUTH(?:[ =]|\s+)([^\n]*)/i.exec(this.capabilities)?.[1] ?? "";
    if (/\bPLAIN\b/i.test(auth)) {
      await this.command(`AUTH PLAIN ${base64(bytes(`\0${user}\0${password}`))}`, "auth", [2]);
    } else if (/\bLOGIN\b/i.test(auth)) {
      await this.command("AUTH LOGIN", "auth", [3]);
      await this.command(base64(bytes(user)), "auth", [3]);
      await this.command(base64(bytes(password)), "auth", [2]);
    } else throw new SmtpFailure("auth");
  }
  async send(user, recipient, subject, text) {
    await this.command(`MAIL FROM:<${user}>`, "mail", [2]);
    await this.command(`RCPT TO:<${recipient}>`, "rcpt", [2]);
    await this.command("DATA", "data", [3]);
    const safeBody = text.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
    const headers = [
      `From: <${user}>`,
      `To: <${recipient}>`,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@qq.com>`
    ].join("\r\n");
    await this.writer.write(bytes(`${headers}\r
\r
${safeBody}\r
.\r
`));
    const reply = await this.readReply("body");
    if (Math.floor(reply.code / 100) !== 2) throw new SmtpFailure("body", reply.code);
  }
  async close() {
    try {
      await this.command("QUIT", "quit", [2]);
    } finally {
      try {
        this.reader.releaseLock();
      } catch {
      }
      try {
        this.writer.releaseLock();
      } catch {
      }
      await this.socket.close();
    }
  }
  async abort() {
    try {
      this.reader.releaseLock();
    } catch {
    }
    try {
      this.writer.releaseLock();
    } catch {
    }
    try {
      await this.socket.close();
    } catch {
    }
  }
};
var CloudSmtp = class {
  constructor(env) {
    this.env = env;
  }
  env;
  async connect() {
    const user = requireEmailRecipients(this.env.QQ_SMTP_USER, true);
    if (user.length !== 1 || !/\b@qq\.com$/i.test(user[0].email) || !this.env.QQ_SMTP_AUTH_CODE)
      throw new SafeCloudFailure("QQ SMTP Secrets \u672A\u6B63\u786E\u914D\u7F6E\u3002", true);
    let socket;
    try {
      socket = connect({ hostname: "smtp.qq.com", port: 465 }, { secureTransport: "on", allowHalfOpen: false });
      await timed(socket.opened, "connect");
      const session = new SmtpSession(socket);
      await session.initialize(user[0].email, this.env.QQ_SMTP_AUTH_CODE);
      return { session, address: user[0].email };
    } catch {
      try {
        await socket?.close();
      } catch {
      }
      throw new SafeCloudFailure("QQ SMTP TLS \u8FDE\u63A5\u6216\u8BA4\u8BC1\u5931\u8D25\u3002", true);
    }
  }
  async verify() {
    const mailer = await this.connect();
    await mailer.session.abort();
  }
  async send(recipient, subject, text) {
    requireEmailRecipients(recipient, true);
    const mailer = await this.connect();
    try {
      await mailer.session.send(mailer.address, recipient, subject.replace(/[\r\n]/g, " "), text);
    } catch (error) {
      const definite = error instanceof SmtpFailure && ["mail", "rcpt", "data", "body"].includes(error.phase) && Math.floor((error.code ?? 0) / 100) === 5;
      throw new SafeCloudFailure(definite ? "\u90AE\u4EF6\u670D\u52A1\u5668\u660E\u786E\u62D2\u7EDD\u4E86\u672C\u6B21\u63D0\u4EA4\u3002" : "SMTP \u63D0\u4EA4\u4E2D\u65AD\uFF0C\u53D1\u9001\u7ED3\u679C\u5F85\u6838\u5B9E\u3002", definite);
    } finally {
      try {
        await mailer.session.abort();
      } catch {
      }
    }
  }
};

// src/feishu.ts
var import_node_buffer = require("node:buffer");

// ../src/shared/feishu-response.ts
var bodies = /* @__PURE__ */ new WeakMap();
function readFeishuJson(response) {
  let value = bodies.get(response);
  if (!value) {
    value = response.json();
    bodies.set(response, value);
  }
  return value;
}

// src/feishu.ts
var tokenError = () => new SafeCloudFailure("\u4E91\u7AEF\u98DE\u4E66\u6388\u6743\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u6388\u6743\u3002", true);
var bytes2 = (value) => new Uint8Array(import_node_buffer.Buffer.from(value, "base64"));
var base642 = (value) => import_node_buffer.Buffer.from(value).toString("base64");
var encryptionKeys = /* @__PURE__ */ new WeakMap();
async function key(env) {
  const cached = encryptionKeys.get(env);
  if (cached) return cached;
  const raw = bytes2(env.TOKEN_ENCRYPTION_KEY);
  if (raw.length !== 32) throw new SafeCloudFailure("\u4E91\u7AEF\u4EE4\u724C\u52A0\u5BC6\u5BC6\u94A5\u914D\u7F6E\u65E0\u6548\u3002", true);
  const imported = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  encryptionKeys.set(env, imported);
  return imported;
}
async function encrypt(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const value = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("pet-feishu-v1") }, await key(env), new TextEncoder().encode(JSON.stringify(token)));
  return `${base642(iv)}.${base642(new Uint8Array(value))}`;
}
async function decrypt(env, value) {
  const [iv, data] = value.split(".");
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes2(iv), additionalData: new TextEncoder().encode("pet-feishu-v1") }, await key(env), bytes2(data));
  return JSON.parse(new TextDecoder().decode(raw));
}
async function exchange(env, grant, fetchFn = fetch) {
  let response;
  try {
    response = await fetchFn("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15e3),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.FEISHU_APP_ID,
        client_secret: env.FEISHU_APP_SECRET,
        ...grant,
        ...grant.grant_type === "authorization_code" ? { redirect_uri: `${env.PUBLIC_URL}/oauth/callback` } : {}
      })
    });
  } catch {
    throw new SafeCloudFailure("\u4E91\u7AEF\u65E0\u6CD5\u8FDE\u63A5\u98DE\u4E66\u6388\u6743\u670D\u52A1\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", true);
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new SafeCloudFailure("\u98DE\u4E66\u6388\u6743\u63A5\u53E3\u8FD4\u56DE\u4E86\u91CD\u5B9A\u5411\uFF0C\u5DF2\u963B\u6B62\u8F6C\u53D1\u6388\u6743\u51ED\u636E\u3002", true);
  }
  let body;
  try {
    body = await readFeishuJson(response);
  } catch {
    throw new SafeCloudFailure("\u98DE\u4E66\u6388\u6743\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u3002", true);
  }
  if (!response.ok || body.code && body.code !== 0) {
    if ([20037, 99991663, 99991664].includes(body.code ?? 0) || response.status === 401) {
      await env.DB.prepare("UPDATE secrets SET value='' WHERE id='feishu'").run();
      throw tokenError();
    }
    throw new SafeCloudFailure("\u4E91\u7AEF\u98DE\u4E66\u6388\u6743\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u5E94\u7528\u6743\u9650\u53CA\u6388\u6743\u914D\u7F6E\u3002", true);
  }
  const data = body.data ?? body;
  if (typeof data.access_token !== "string" || !data.access_token || typeof data.refresh_token !== "string" || !data.refresh_token) throw tokenError();
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + Number(data.expires_in ?? 3600) * 1e3 };
}
var CloudFeishu = class {
  constructor(env, fetchFn = (input, init) => fetch(input, init)) {
    this.env = env;
    this.fetchFn = fetchFn;
  }
  env;
  fetchFn;
  async start() {
    const state = crypto.randomUUID();
    await this.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<?").bind(Date.now()).run();
    await this.env.DB.prepare("INSERT INTO oauth_states (id,expires_at) VALUES (?,?)").bind(state, Date.now() + 6e5).run();
    const url = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
    url.search = new URLSearchParams({
      app_id: this.env.FEISHU_APP_ID,
      redirect_uri: `${this.env.PUBLIC_URL}/oauth/callback`,
      state,
      scope: this.env.FEISHU_SCOPE || "calendar:calendar:readonly offline_access"
    }).toString();
    return url.toString();
  }
  async finish(code, state) {
    const row = await this.env.DB.prepare("SELECT id FROM oauth_states WHERE id=? AND expires_at>?").bind(state, Date.now()).first();
    if (!row || !code || code.length > 2e3) throw new SafeCloudFailure("\u6388\u6743\u94FE\u63A5\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u5F00\u59CB\u6388\u6743\u3002", true);
    const consumed = await this.env.DB.prepare("DELETE FROM oauth_states WHERE id=? AND expires_at>?").bind(state, Date.now()).run();
    if (consumed.meta.changes !== 1) throw new SafeCloudFailure("\u6388\u6743\u94FE\u63A5\u5DF2\u88AB\u4F7F\u7528\uFF0C\u8BF7\u91CD\u65B0\u5F00\u59CB\u6388\u6743\u3002", true);
    await this.env.DB.prepare("INSERT OR IGNORE INTO secrets (id,value) VALUES ('feishu','')").run();
    const lease = crypto.randomUUID();
    const claimed = await this.env.DB.prepare("UPDATE secrets SET lease_until=?,lease_id=? WHERE id='feishu' AND lease_until<?").bind(Date.now() + 6e4, lease, Date.now()).run();
    if (claimed.meta.changes !== 1) throw new SafeCloudFailure("\u6388\u6743\u5904\u7406\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u6388\u6743\u3002", true);
    try {
      const token = await exchange(this.env, { grant_type: "authorization_code", code }, this.fetchFn);
      let encrypted;
      try {
        encrypted = await encrypt(this.env, token);
      } catch {
        throw new SafeCloudFailure("\u4E91\u7AEF\u4EE4\u724C\u52A0\u5BC6\u914D\u7F6E\u65E0\u6548\uFF0C\u8BF7\u68C0\u67E5 TOKEN_ENCRYPTION_KEY\u3002", true);
      }
      await this.env.DB.prepare("UPDATE secrets SET value=?,lease_until=0,lease_id=NULL WHERE id='feishu' AND lease_id=?").bind(encrypted, lease).run();
    } finally {
      await this.env.DB.prepare("UPDATE secrets SET lease_until=0,lease_id=NULL WHERE id='feishu' AND lease_id=?").bind(lease).run();
    }
  }
  async token(forceRefresh = false) {
    const row = await this.env.DB.prepare("SELECT value FROM secrets WHERE id='feishu'").first();
    if (!row?.value) throw tokenError();
    let token = await decrypt(this.env, row.value);
    if (!forceRefresh && token.expires_at > Date.now() + 6e4) return token.access_token;
    const lease = crypto.randomUUID();
    const claimed = await this.env.DB.prepare("UPDATE secrets SET lease_until=?,lease_id=? WHERE id='feishu' AND lease_until<?").bind(Date.now() + 6e4, lease, Date.now()).run();
    if (claimed.meta.changes !== 1) throw new SafeCloudFailure("\u98DE\u4E66\u6388\u6743\u5237\u65B0\u4E2D\uFF0C\u5DF2\u6682\u505C\u672C\u8F6E\u53D1\u9001\u3002", true);
    try {
      const latest = await this.env.DB.prepare("SELECT value FROM secrets WHERE id='feishu'").first();
      if (!latest?.value) throw tokenError();
      if (latest.value !== row.value) token = await decrypt(this.env, latest.value);
      if (forceRefresh || token.expires_at <= Date.now() + 6e4) {
        const refreshed = await exchange(this.env, { grant_type: "refresh_token", refresh_token: token.refresh_token }, this.fetchFn);
        await this.env.DB.prepare("UPDATE secrets SET value=? WHERE id='feishu' AND lease_id=?").bind(await encrypt(this.env, refreshed), lease).run();
        token = refreshed;
      }
      return token.access_token;
    } finally {
      await this.env.DB.prepare("UPDATE secrets SET lease_until=0,lease_id=NULL WHERE id='feishu' AND lease_id=?").bind(lease).run();
    }
  }
  async verify() {
    const token = await this.token();
    let response;
    try {
      response = await this.fetchFn("https://open.feishu.cn/open-apis/calendar/v4/calendars?page_size=50", {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15e3),
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {
      throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u6743\u9650\u9A8C\u8BC1\u8FDE\u63A5\u5931\u8D25\u6216\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", true);
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u63A5\u53E3\u8FD4\u56DE\u4E86\u91CD\u5B9A\u5411\uFF0C\u5DF2\u963B\u6B62\u8F6C\u53D1\u6388\u6743\u51ED\u636E\u3002", true);
    }
    if (response.status === 401) {
      await this.env.DB.prepare("UPDATE secrets SET value='' WHERE id='feishu'").run();
      throw tokenError();
    }
    if (response.status === 403) throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u8BFB\u53D6\u6743\u9650\u4E0D\u8DB3\uFF0C\u8BF7\u68C0\u67E5\u4E91\u7AEF\u72EC\u7ACB\u5E94\u7528\u6743\u9650\u4E0E\u7528\u6237\u6388\u6743\u8303\u56F4\u3002", true);
    if (response.status === 429) throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u63A5\u53E3\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", true);
    let body;
    try {
      body = await readFeishuJson(response);
    } catch {
      throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u63A5\u53E3\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u3002", true);
    }
    if (!body || typeof body !== "object") throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u63A5\u53E3\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\u3002", true);
    if ([20037, 99991663, 99991664].includes(body.code ?? 0)) {
      await this.env.DB.prepare("UPDATE secrets SET value='' WHERE id='feishu'").run();
      throw tokenError();
    }
    if (body.code === 99991672) throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u8BFB\u53D6\u6743\u9650\u4E0D\u8DB3\uFF0C\u8BF7\u68C0\u67E5\u4E91\u7AEF\u72EC\u7ACB\u5E94\u7528\u6743\u9650\u4E0E\u7528\u6237\u6388\u6743\u8303\u56F4\u3002", true);
    if (!response.ok || body.code !== 0) throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u8BFB\u53D6\u9A8C\u8BC1\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u5E94\u7528\u6743\u9650\u6216\u7A0D\u540E\u91CD\u8BD5\u3002", true);
    if (!Array.isArray(body.data?.calendar_list) && !Array.isArray(body.data?.items)) {
      throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u5386\u63A5\u53E3\u8FD4\u56DE\u4E86\u4E0D\u5B8C\u6574\u7684\u6570\u636E\uFF0C\u672A\u901A\u8FC7\u8BFB\u53D6\u9A8C\u8BC1\u3002", true);
    }
  }
  async event(id) {
    const match = /^feishu:(.+):([^:]+)$/.exec(id);
    if (!match) throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u7A0B\u6807\u8BC6\u65E0\u6548\u3002", true);
    const token = await this.token();
    const response = await this.fetchFn(`https://open.feishu.cn/open-apis/calendar/v4/calendars/${encodeURIComponent(match[1])}/events/${encodeURIComponent(match[2])}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15e3),
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u7A0B\u63A5\u53E3\u8FD4\u56DE\u4E86\u91CD\u5B9A\u5411\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002", true);
    }
    const body = await readFeishuJson(response);
    if (response.status === 401 || [20037, 99991663, 99991664].includes(body.code ?? 0)) {
      await this.env.DB.prepare("UPDATE secrets SET value='' WHERE id='feishu'").run();
      throw tokenError();
    }
    if (!response.ok || body.code && body.code !== 0 || !body.data?.event) throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u7A0B\u8BFB\u53D6\u5931\u8D25\u6216\u6743\u9650\u4E0D\u8DB3\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002", true);
    const e = body.data.event;
    if (e.status === "cancelled" || e.is_deleted === true) return null;
    const time = (t) => t?.timestamp && /^\d+$/.test(t.timestamp) ? new Date(Number(t.timestamp) * 1e3).toISOString() : t?.date ? (/* @__PURE__ */ new Date(`${t.date}T00:00:00+08:00`)).toISOString() : void 0;
    const startsAt = time(e.start_time);
    const endsAt = time(e.end_time);
    if (!startsAt || !e.summary) throw new SafeCloudFailure("\u98DE\u4E66\u65E5\u7A0B\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002", true);
    return { id, provider: "feishu", title: e.summary, startsAt, endsAt, location: e.location?.name, notes: e.description, emailReminderEnabled: true };
  }
};

// ../src/shared/feishu-relay.ts
var RELAY_INTERVAL = 15 * 6e4;
var RELAY_PROTOCOL = 1;
var RELAY_FIELDS = { id: "request_id", payload: "envelope" };
var RelayFailure = class extends Error {
  constructor(message, kind = "invalid", httpStatus) {
    super(message);
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
  kind;
  httpStatus;
};
function relayKey(value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new RelayFailure("\u4E2D\u8F6C\u52A0\u5BC6\u5BC6\u94A5\u5FC5\u987B\u662F 32 \u5B57\u8282\u968F\u673A\u503C\u7684 Base64\u3002");
  const raw = decodeBase64(value);
  if (raw.length !== 32) throw new RelayFailure("\u4E2D\u8F6C\u52A0\u5BC6\u5BC6\u94A5\u65E0\u6548\u3002");
  return raw;
}
function relayId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new RelayFailure("\u4E2D\u8F6C\u6807\u8BC6\u65E0\u6548\u3002");
  return value;
}
function base643(value) {
  const native = value.toBase64;
  if (native) return native.call(value);
  let text = "";
  for (let offset = 0; offset < value.length; offset += 8192) text += String.fromCharCode(...value.slice(offset, offset + 8192));
  return btoa(text);
}
function decodeBase64(value) {
  const native = Uint8Array.fromBase64;
  return native ? native(value) : Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
var derivedKeys = /* @__PURE__ */ new Map();
async function encryptionKey(secret, direction) {
  const id = `${direction}:${secret}`;
  const cached = derivedKeys.get(id);
  if (cached) return cached;
  const pending = (async () => {
    const key2 = await crypto.subtle.importKey("raw", relayKey(secret), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("pet-relay-v1"),
      info: new TextEncoder().encode(direction)
    }, key2, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  })();
  if (derivedKeys.size >= 12) derivedKeys.delete(derivedKeys.keys().next().value);
  derivedKeys.set(id, pending);
  try {
    return await pending;
  } catch (error) {
    derivedKeys.delete(id);
    throw error;
  }
}
async function sealRelay(secret, direction, requestId, value) {
  relayId(requestId);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  if (plaintext.length > 18e4) throw new RelayFailure("\u4E2D\u8F6C\u5185\u5BB9\u8FC7\u957F\uFF0C\u8BF7\u51CF\u5C11\u65E5\u7A0B\u6B63\u6587\u6216\u5206\u6279\u8BFB\u53D6\u5386\u53F2\u3002");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: new TextEncoder().encode(`${RELAY_PROTOCOL}:${direction}:${requestId}`)
  }, await encryptionKey(secret, direction), plaintext);
  return `1.${base643(iv)}.${base643(new Uint8Array(encrypted))}`;
}
async function openRelay(secret, direction, requestId, envelope) {
  relayId(requestId);
  if (typeof envelope !== "string" || envelope.length > 25e4) throw new RelayFailure("\u4E2D\u8F6C\u52A0\u5BC6\u6D88\u606F\u65E0\u6548\u3002");
  try {
    const [version, iv, data, extra] = envelope.split(".");
    if (version !== "1" || !iv || !data || extra) throw new Error();
    const raw = decodeBase64;
    if (raw(iv).length !== 12) throw new Error();
    const decrypted = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: raw(iv),
      additionalData: new TextEncoder().encode(`${RELAY_PROTOCOL}:${direction}:${requestId}`)
    }, await encryptionKey(secret, direction), raw(data));
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw new RelayFailure("\u4E2D\u8F6C\u6D88\u606F\u6821\u9A8C\u5931\u8D25\uFF0C\u5DF2\u963B\u6B62\u5904\u7406\u3002\u8BF7\u6838\u5BF9\u4E24\u7AEF\u5BC6\u94A5\u3002");
  }
}
function validateRelayCommand(value) {
  const c = value;
  if (!c || typeof c !== "object") throw new RelayFailure("\u4E2D\u8F6C\u547D\u4EE4\u65E0\u6548\u3002");
  relayId(c.requestId);
  if (!Number.isSafeInteger(c.createdAt) || c.createdAt < 0 || c.createdAt > Date.now() + 3e5) throw new RelayFailure("\u4E2D\u8F6C\u547D\u4EE4\u65F6\u95F4\u65E0\u6548\u3002");
  const task = /^\/v1\/tasks\/[^/?#]{1,2000}(?:\/(attempts|act))?(?:\?before=[^&#]{1,300})?$/.test(c.path);
  if (!(c.method === "POST" && c.path === "/v1/verify") && !task) throw new RelayFailure("\u4E2D\u8F6C\u547D\u4EE4\u8DEF\u5F84\u65E0\u6548\u3002");
  if (!["GET", "PUT", "DELETE", "POST"].includes(c.method)) throw new RelayFailure("\u4E2D\u8F6C\u547D\u4EE4\u65B9\u6CD5\u65E0\u6548\u3002");
  if (c.method === "POST" && c.path.endsWith("/act") && Date.now() - c.createdAt > 30 * 6e4) throw new RelayFailure("\u53D1\u9001\u64CD\u4F5C\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u5237\u65B0\u9884\u89C8\u5E76\u91CD\u65B0\u786E\u8BA4\u3002");
  return c;
}
function relayMonth(now = Date.now()) {
  return new Date(now + 8 * 60 * 6e4).toISOString().slice(0, 7);
}
function relayApiError(status, value) {
  if (value?.code === 99991403) return new RelayFailure("\u98DE\u4E66\u672C\u6708 API \u989D\u5EA6\u5DF2\u8017\u5C3D\uFF0C\u4E2D\u8F6C\u548C\u53D1\u9001\u5DF2\u6682\u505C\uFF0C\u4E0D\u80FD\u81EA\u52A8\u6536\u8D39\u5347\u7EA7\u3002", "quota");
  if (status === 429 || [99991400, 1254290, 1254291].includes(value?.code)) return new RelayFailure("\u98DE\u4E66\u63A5\u53E3\u9650\u6D41\u6216\u8BFB\u5199\u51B2\u7A81\uFF0C\u5DF2\u6682\u505C\u672C\u8F6E\u64CD\u4F5C\uFF0C\u7A0D\u540E\u91CD\u8BD5\u3002", "network");
  if ([1254103, 1254130].includes(value?.code)) return new RelayFailure("\u98DE\u4E66\u8868\u683C\u5BB9\u91CF\u6216\u5355\u5143\u683C\u5185\u5BB9\u8FBE\u5230\u9650\u5236\uFF0C\u4E2D\u8F6C\u5DF2\u6682\u505C\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u6269\u5BB9\u3002", "capacity");
  if (status === 403 || [99991672, 99991679, 131006, 1254302].includes(value?.code)) return new RelayFailure("\u98DE\u4E66\u4E2D\u8F6C\u6743\u9650\u4E0D\u8DB3\uFF0C\u8BF7\u6838\u5BF9\u5E94\u7528\u8EAB\u4EFD\u6743\u9650\u53CA\u79C1\u6709\u8868\u683C\u7684\u6587\u6863\u5E94\u7528\u6388\u6743\u3002", "permission");
  return new RelayFailure("\u98DE\u4E66\u4E2D\u8F6C\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u914D\u7F6E\u6216\u7A0D\u540E\u91CD\u8BD5\u3002", "network");
}
function relayText(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => v && typeof v.text === "string" && v.type === "text")) return value.map((v) => v.text).join("");
  throw new RelayFailure("\u4E2D\u8F6C\u5B57\u6BB5\u7C7B\u578B\u65E0\u6548\uFF0C\u9700\u8981\u591A\u884C\u6587\u672C\u5B57\u6BB5\u3002");
}
var BitableRelayApi = class {
  constructor(config, fetchFn, reserve, tokenStore, exhausted) {
    this.config = config;
    this.fetchFn = fetchFn;
    this.reserve = reserve;
    this.tokenStore = tokenStore;
    this.exhausted = exhausted;
    relayId(config.appToken);
    relayId(config.commands);
    relayId(config.receipts);
    if (!config.appId || !config.appSecret || config.commands === config.receipts) throw new RelayFailure("\u8BF7\u586B\u5199\u5B8C\u6574\u4E2D\u8F6C\u914D\u7F6E\uFF0C\u547D\u4EE4\u8868\u4E0E\u56DE\u6267\u8868\u5FC5\u987B\u4E0D\u540C\u3002");
  }
  config;
  fetchFn;
  reserve;
  tokenStore;
  exhausted;
  access;
  async raw(path, body, token) {
    await this.reserve();
    let r;
    const fetchFn = this.fetchFn;
    try {
      r = await fetchFn(`https://open.feishu.cn/open-apis/${path}`, {
        method: body ? "POST" : "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15e3),
        headers: { "Content-Type": "application/json", ...token ? { Authorization: `Bearer ${token}` } : {} },
        ...body ? { body: JSON.stringify(body) } : {}
      });
    } catch {
      throw new RelayFailure("\u98DE\u4E66\u4E2D\u8F6C\u8FDE\u63A5\u5931\u8D25\u6216\u8D85\u65F6\uFF0C\u8BA1\u5212\u4ECD\u4FDD\u7559\u672C\u5730\u3002", "network");
    }
    if (r.status >= 300 && r.status < 400) {
      await r.body?.cancel?.();
      throw new RelayFailure("\u98DE\u4E66\u8FD4\u56DE\u91CD\u5B9A\u5411\uFF0C\u5DF2\u963B\u6B62\u8F6C\u53D1\u51ED\u636E\u3002");
    }
    let data;
    try {
      data = await readFeishuJson(r);
    } catch {
      throw new RelayFailure("\u98DE\u4E66\u4E2D\u8F6C\u8FD4\u56DE\u975E JSON \u54CD\u5E94\u3002", "network");
    }
    if (!r.ok || data?.code !== 0) {
      if (data?.code === 99991403) await this.exhausted?.();
      throw relayApiError(r.status, data);
    }
    return data;
  }
  async token(forceRefresh = false) {
    this.access ??= await this.tokenStore?.read();
    if (!forceRefresh && this.access && this.access.expiresAt > Date.now() + 6e4) return this.access.token;
    const value = await this.raw("auth/v3/tenant_access_token/internal", { app_id: this.config.appId, app_secret: this.config.appSecret });
    if (typeof value.tenant_access_token !== "string" || !value.tenant_access_token || !Number.isFinite(value.expire)) throw new RelayFailure("\u98DE\u4E66\u5E94\u7528\u4EE4\u724C\u54CD\u5E94\u65E0\u6548\u3002");
    this.access = { token: value.tenant_access_token, expiresAt: Date.now() + value.expire * 1e3 };
    await this.tokenStore?.write(this.access);
    return this.access.token;
  }
  async prepareToken(forceRefresh = false) {
    this.access ??= await this.tokenStore?.read();
    if (!forceRefresh && this.access && this.access.expiresAt > Date.now() + 6e4) return false;
    await this.token(forceRefresh);
    return true;
  }
  path(table) {
    return `bitable/v1/apps/${this.config.appToken}/tables/${relayId(table)}/records`;
  }
  async list(table) {
    const result = [];
    const cursors = /* @__PURE__ */ new Set();
    let cursor = "";
    const token = await this.token();
    do {
      const response = await this.raw(
        `${this.path(table)}/search?page_size=100${cursor ? `&page_token=${encodeURIComponent(cursor)}` : ""}`,
        { field_names: [RELAY_FIELDS.id, RELAY_FIELDS.payload] },
        token
      );
      const page = response.data;
      if (!Array.isArray(page?.items) || typeof page.has_more !== "boolean") throw new RelayFailure("\u8868\u683C\u5206\u9875\u54CD\u5E94\u4E0D\u5B8C\u6574\uFF0C\u4FDD\u7559\u65E7\u72B6\u6001\u3002", "network");
      result.push(...page.items);
      if (result.length > 2e3) throw new RelayFailure("\u4E2D\u8F6C\u8868\u8D85\u8FC7\u4FDD\u5B88\u7684 2000 \u884C\u9650\u5236\uFF0C\u8BF7\u5148\u5F52\u6863\u5DF2\u786E\u8BA4\u8BB0\u5F55\u3002", "capacity");
      if (!page.has_more) break;
      cursor = page.page_token;
      if (!cursor || typeof cursor !== "string" || cursors.has(cursor)) throw new RelayFailure("\u8868\u683C\u5206\u9875\u4E2D\u65AD\uFF0C\u4FDD\u7559\u65E7\u72B6\u6001\u3002", "network");
      cursors.add(cursor);
    } while (true);
    return result;
  }
  async create(table, values) {
    if (!values.length) return [];
    if (values.length > 20) throw new RelayFailure("\u4E2D\u8F6C\u5355\u6279\u6700\u591A 20 \u6761\u3002");
    const result = await this.raw(`${this.path(table)}/batch_create`, { records: values.map((v) => ({ fields: {
      [RELAY_FIELDS.id]: relayId(v.requestId),
      [RELAY_FIELDS.payload]: v.envelope
    } })) }, await this.token());
    if (!Array.isArray(result.data?.records) || result.data.records.length !== values.length) throw new RelayFailure("\u4E0A\u4F20\u56DE\u6267\u4E0D\u5B8C\u6574\uFF0C\u7B49\u5F85\u67E5\u8BE2\u540E\u6838\u5B9E\u3002", "network");
    return result.data.records;
  }
  async remove(table, ids) {
    if (!ids.length) return;
    if (ids.length > 100) throw new RelayFailure("\u4E2D\u8F6C\u5F52\u6863\u5355\u6279\u6700\u591A 100 \u6761\u3002");
    const result = await this.raw(`${this.path(table)}/batch_delete`, { records: ids.map(relayId) }, await this.token());
    if (!Array.isArray(result.data?.records) || ids.some((id) => !result.data.records.some((r) => r.record_id === id && r.deleted === true)))
      throw new RelayFailure("\u5F52\u6863\u5220\u9664\u7ED3\u679C\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u7A0D\u540E\u67E5\u8BE2\u6838\u5B9E\u3002", "network");
  }
};

// src/relay.ts
async function reserveCloudApi(env) {
  const month = relayMonth();
  const result = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO relay_usage(month) VALUES (?)").bind(month),
    env.DB.prepare("UPDATE relay_usage SET used=used+1 WHERE month=? AND used<6000 AND exhausted=0").bind(month)
  ]);
  const changed = result[1];
  if (changed.meta.changes !== 1) throw new RelayFailure("\u672C\u6708\u4E91\u7AEF API \u9884\u7B97\u5DF2\u7528\u5B8C\u6216\u98DE\u4E66\u989D\u5EA6\u5DF2\u8017\u5C3D\uFF0C\u53D1\u9001\u5DF2\u6682\u505C\u3002", "quota");
}
async function exhaustCloudApi(env) {
  await env.DB.prepare("UPDATE relay_usage SET exhausted=1 WHERE month=?").bind(relayMonth()).run();
}
function cloudBudgetFetch(env, fetchFn = fetch) {
  return async (input, init) => {
    if (env.RELAY_ENABLED !== "true") return fetchFn(input, init);
    await reserveCloudApi(env);
    const response = await fetchFn(input, init);
    try {
      const body = await readFeishuJson(response);
      if (body?.code === 99991403) {
        await exhaustCloudApi(env);
        throw new RelayFailure("\u98DE\u4E66\u672C\u6708 API \u989D\u5EA6\u5DF2\u8017\u5C3D\uFF0C\u53D1\u9001\u5DF2\u6682\u505C\u3002", "quota");
      }
    } catch (error) {
      if (error instanceof RelayFailure) throw error;
    }
    return response;
  };
}
var CloudRelay = class {
  constructor(env, dispatch, fetchFn = (input, init) => fetch(input, init)) {
    this.env = env;
    this.dispatch = dispatch;
    this.key = env.RELAY_ENCRYPTION_KEY ?? "";
    this.api = new BitableRelayApi(
      {
        appId: env.FEISHU_APP_ID,
        appSecret: env.FEISHU_APP_SECRET,
        appToken: env.RELAY_APP_TOKEN ?? "",
        commands: env.RELAY_COMMAND_TABLE ?? "",
        receipts: env.RELAY_RECEIPT_TABLE ?? ""
      },
      fetchFn,
      () => reserveCloudApi(env),
      {
        read: async () => {
          const row = await env.DB.prepare("SELECT value FROM secrets WHERE id='relay_tenant'").first();
          if (!row?.value) return void 0;
          try {
            return await openRelay(this.key, "token", "tenant", row.value);
          } catch {
            await env.DB.prepare("DELETE FROM secrets WHERE id='relay_tenant' AND value=?").bind(row.value).run();
            return void 0;
          }
        },
        write: async (token) => {
          await env.DB.prepare("INSERT INTO secrets(id,value) VALUES ('relay_tenant',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(await sealRelay(this.key, "token", "tenant", token)).run();
        }
      },
      () => exhaustCloudApi(env)
    );
  }
  env;
  dispatch;
  api;
  key;
  seen = [];
  keyHash;
  async proofScope() {
    return this.keyHash ??= Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
      JSON.stringify([this.key, this.api.config.appId, this.api.config.appToken, this.api.config.commands, this.api.config.receipts])
    )))).map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  async poll(force = false, readOnly = false, withProof = false) {
    const now = Date.now();
    if (!force) {
      const last = await this.env.DB.prepare("SELECT value FROM relay_state WHERE id='poll_at'").first();
      if ((last?.value ?? 0) > now - RELAY_INTERVAL) return;
    }
    const lock = await this.acquire(now);
    if (lock.meta.changes !== 1) throw new RelayFailure("\u4E91\u7AEF\u4E2D\u8F6C\u6B63\u5728\u6838\u5B9E\uFF0C\u5DF2\u6682\u505C\u672C\u8F6E\u53D1\u9001\u3002", "pending");
    let released = false;
    try {
      if (!force) await this.env.DB.prepare("INSERT INTO relay_state(id,value) VALUES ('poll_at',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(now).run();
      if (readOnly && await this.api.prepareToken())
        throw new RelayFailure("\u98DE\u4E66\u5E94\u7528\u4EE4\u724C\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u4E0B\u4E00\u8F6E\u7EE7\u7EED\u5B8C\u6574\u8BFB\u53D6\u547D\u4EE4\u3002", "pending");
      const records = await this.api.list(this.api.config.commands);
      const completed = /* @__PURE__ */ new Map();
      const ids = [...new Set(records.map((r) => relayText(r.fields[RELAY_FIELDS.id])).filter(Boolean))];
      for (let offset = 0; offset < ids.length; offset += 10) {
        const batch = ids.slice(offset, offset + 10);
        const rows = await this.env.DB.prepare("SELECT id,command,response,command_envelope,command_key_hash FROM relay_requests WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(batch)).all();
        for (const row of rows.results) completed.set(row.id, row);
      }
      const keyHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.key)))).map((n) => n.toString(16).padStart(2, "0")).join("");
      const source = /* @__PURE__ */ new Map();
      const commands = [];
      for (const record of records) {
        if (!record.fields[RELAY_FIELDS.id] && !record.fields[RELAY_FIELDS.payload]) continue;
        const id = relayText(record.fields[RELAY_FIELDS.id]);
        if (!id && !record.fields[RELAY_FIELDS.payload]) continue;
        relayId(id);
        const payload = relayText(record.fields[RELAY_FIELDS.payload]);
        const known = completed.get(id);
        const c = known?.command_envelope === payload && known.command_key_hash === keyHash ? JSON.parse(known.command) : await openRelay(this.key, "command", id, payload);
        if (c.requestId !== id) throw new RelayFailure("\u4E2D\u8F6C\u8BF7\u6C42\u6807\u8BC6\u4E0D\u4E00\u81F4\u3002");
        source.set(id, payload);
        commands.push(c);
      }
      this.seen = commands;
      commands.sort((a, b) => a.createdAt - b.createdAt || a.requestId.localeCompare(b.requestId));
      const unique = /* @__PURE__ */ new Map();
      for (const command of commands) {
        const other = unique.get(command.requestId);
        if (other && JSON.stringify(other) !== JSON.stringify(command)) throw new RelayFailure("\u91CD\u590D\u8BF7\u6C42 ID \u5185\u5BB9\u51B2\u7A81\uFF0C\u5DF2\u6682\u505C\u5904\u7406\u3002");
        unique.set(command.requestId, command);
      }
      for (const command of commands) {
        const old = completed.get(command.requestId);
        if (old && old.command !== JSON.stringify(command)) throw new RelayFailure("\u91CD\u590D\u8BF7\u6C42 ID \u5185\u5BB9\u51B2\u7A81\uFF0C\u5DF2\u6682\u505C\u5904\u7406\u3002");
      }
      const changed = [...unique.values()].filter((c) => completed.get(c.requestId)?.command_envelope !== source.get(c.requestId) || completed.get(c.requestId)?.command_key_hash !== keyHash);
      for (const c of changed) await this.env.DB.prepare(`INSERT INTO relay_requests(id,command,created_at,command_envelope,command_key_hash)
        VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET command_envelope=excluded.command_envelope,command_key_hash=excluded.command_key_hash
        WHERE relay_requests.command=excluded.command`).bind(c.requestId, JSON.stringify(c), c.createdAt, source.get(c.requestId), keyHash).run();
      const next = commands.filter((c) => !completed.get(c.requestId)?.response)[0];
      if (!readOnly) {
        if (next) await this.process(next);
        await this.publish();
      }
      if (withProof) {
        const nonce = crypto.randomUUID();
        const snapshot = {
          nonce,
          checkedAt: Date.now(),
          scope: await this.proofScope(),
          commands: this.seen.map((c) => ({ method: c.method, path: c.path, version: c.body?.version, action: c.body?.action }))
        };
        await this.env.DB.batch([
          this.env.DB.prepare("INSERT INTO secrets(id,value) VALUES ('executor_relay_proof',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(JSON.stringify(snapshot)),
          this.env.DB.prepare("UPDATE relay_state SET value=0 WHERE id='poll_lease'")
        ]);
        released = true;
        return nonce;
      }
    } finally {
      if (!released) await this.env.DB.prepare("UPDATE relay_state SET value=0 WHERE id='poll_lease'").run();
    }
  }
  acquire(now) {
    return this.env.DB.prepare("INSERT INTO relay_state(id,value) VALUES ('poll_lease',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE relay_state.value<?").bind(now + 12e4, now).run();
  }
  async queued(operation) {
    const now = Date.now();
    const lock = await this.acquire(now);
    if (lock.meta.changes !== 1) throw new RelayFailure("\u4E91\u7AEF\u4E2D\u8F6C\u6B63\u5728\u6838\u5B9E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", "pending");
    try {
      await operation();
    } finally {
      await this.env.DB.prepare("UPDATE relay_state SET value=0 WHERE id='poll_lease'").run();
    }
  }
  async processQueued() {
    let processed = false;
    await this.queued(async () => {
      const row = await this.env.DB.prepare("SELECT command FROM relay_requests WHERE response IS NULL AND command_envelope IS NOT NULL ORDER BY created_at,id LIMIT 1").first();
      if (row) {
        await this.process(JSON.parse(row.command), false);
        processed = true;
      }
    });
    return processed;
  }
  async publishQueued(limit = 1) {
    await this.queued(() => this.publish(limit));
  }
  async tick() {
    if (await this.env.DB.prepare("SELECT id FROM relay_requests WHERE response IS NOT NULL AND published_at IS NULL LIMIT 1").first()) {
      await this.publishQueued();
      return;
    }
    if (await this.env.DB.prepare("SELECT id FROM relay_requests WHERE response IS NULL AND command_envelope IS NOT NULL LIMIT 1").first()) {
      await this.processQueued();
      return;
    }
    if (await this.api.prepareToken()) return;
    await this.poll(false, true);
  }
  async proof() {
    const nonce = await this.poll(true, true, true);
    if (!nonce) throw new RelayFailure("\u672A\u5B8C\u6210\u5B8C\u6574\u547D\u4EE4\u6838\u5B9E\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002", "pending");
    return nonce;
  }
  async checkProof(nonce, id, version) {
    const row = await this.env.DB.prepare("SELECT value FROM secrets WHERE id='executor_relay_proof'").first();
    if (!row || typeof nonce !== "string") throw new RelayFailure("\u7F3A\u5C11\u5B8C\u6574\u7684\u6700\u65B0\u547D\u4EE4\u6838\u5B9E\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002", "pending");
    const snapshot = JSON.parse(row.value);
    if (snapshot.nonce !== nonce || snapshot.scope !== await this.proofScope() || snapshot.checkedAt > Date.now() || Date.now() - snapshot.checkedAt > 3e4)
      throw new RelayFailure("\u6700\u65B0\u547D\u4EE4\u6838\u5B9E\u5DF2\u8FC7\u671F\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002", "pending");
    const path = `/v1/tasks/${encodeURIComponent(id)}`;
    if (snapshot.commands.some((c) => c.method !== "GET" && (c.path === path && Number(c.version) > version || c.path === path + "/act" && Number(c.version) >= version && c.action === "skip")))
      throw new RelayFailure("\u68C0\u6D4B\u5230\u4FEE\u6539\u6216\u53D6\u6D88\uFF0C\u5DF2\u6682\u505C\u65E7\u7248\u672C\u90AE\u4EF6\uFF0C\u7B49\u5F85\u4E91\u7AEF\u786E\u8BA4\u3002", "pending");
  }
  async process(command, encryptReceipt = true) {
    const old = await this.env.DB.prepare("SELECT * FROM relay_requests WHERE id=?").bind(command.requestId).first();
    if (old && old.command !== JSON.stringify(command)) throw new RelayFailure("\u91CD\u590D\u8BF7\u6C42 ID \u5BF9\u5E94\u4E0D\u540C\u5185\u5BB9\uFF0C\u5DF2\u963B\u6B62\u5904\u7406\u3002");
    if (old?.response) return;
    if (["PUT", "DELETE"].includes(command.method)) {
      const match = /^\/v1\/tasks\/([^/?]+)$/.exec(command.path);
      if (match) {
        const current = await new CloudStore(this.env.DB).get(decodeURIComponent(match[1]));
        if (current?.status === "verifying") return;
      }
    }
    if (!old) await this.env.DB.prepare("INSERT OR IGNORE INTO relay_requests(id,command,created_at) VALUES (?,?,?)").bind(command.requestId, JSON.stringify(command), command.createdAt).run();
    const lease = crypto.randomUUID();
    const claimed = await this.env.DB.prepare("UPDATE relay_requests SET lease_id=?,lease_until=? WHERE id=? AND response IS NULL AND lease_until<?").bind(lease, Date.now() + 12e4, command.requestId, Date.now()).run();
    if (claimed.meta.changes !== 1) throw new RelayFailure("\u4E2D\u8F6C\u547D\u4EE4\u5904\u7406\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u56DE\u6267\u3002", "pending");
    let completed = false;
    try {
      let response;
      try {
        validateRelayCommand(command);
        response = await this.dispatch(new Request(`https://relay.internal${command.path}`, {
          method: command.method,
          headers: { Authorization: `Bearer ${this.env.ACCESS_KEY}`, "Content-Type": "application/json", "X-Pet-Relay-Request": command.requestId },
          ...command.method !== "GET" ? { body: JSON.stringify(command.body ?? {}) } : {}
        }));
      } catch (error) {
        if (error instanceof RelayFailure && ["quota", "network", "pending"].includes(error.kind)) throw error;
        response = Response.json({ message: error instanceof RelayFailure ? error.message : "\u4E2D\u8F6C\u547D\u4EE4\u65E0\u6548\u3002" }, { status: 400 });
      }
      const receipt = { requestId: command.requestId, completedAt: Date.now(), status: response.status, value: await response.json() };
      const envelope = encryptReceipt ? await sealRelay(this.key, "receipt", command.requestId, receipt) : null;
      const saved = await this.env.DB.prepare("UPDATE relay_requests SET response=?,envelope=?,completed_at=?,lease_until=0,lease_id=NULL WHERE id=? AND lease_id=?").bind(JSON.stringify(receipt), envelope, receipt.completedAt, command.requestId, lease).run();
      completed = saved.meta.changes === 1;
    } finally {
      if (!completed) await this.env.DB.prepare("UPDATE relay_requests SET lease_until=0,lease_id=NULL WHERE id=? AND lease_id=?").bind(command.requestId, lease).run();
    }
  }
  async publish(limit = 20) {
    const rows = (await this.env.DB.prepare("SELECT * FROM relay_requests WHERE response IS NOT NULL AND published_at IS NULL ORDER BY created_at LIMIT ?").bind(limit).all()).results;
    if (!rows.length) return;
    for (const row of rows) if (!row.envelope) {
      row.envelope = await sealRelay(this.key, "receipt", row.id, JSON.parse(row.response));
      await this.env.DB.prepare("UPDATE relay_requests SET envelope=? WHERE id=? AND envelope IS NULL").bind(row.envelope, row.id).run();
    }
    const now = Date.now();
    const retryRows = rows.filter((row) => row.publish_attempted_at !== null);
    const existing = retryRows.length ? await this.api.list(this.api.config.receipts) : [];
    const found = /* @__PURE__ */ new Set();
    for (const record of existing) {
      if (!record.fields[RELAY_FIELDS.id] && !record.fields[RELAY_FIELDS.payload]) continue;
      const id = relayText(record.fields[RELAY_FIELDS.id]);
      if (!id && !record.fields[RELAY_FIELDS.payload]) continue;
      const row = retryRows.find((r) => r.id === id);
      if (!row) continue;
      const receipt = await openRelay(this.key, "receipt", id, relayText(record.fields[RELAY_FIELDS.payload]));
      if (JSON.stringify(receipt) !== row.response) throw new RelayFailure("\u4E91\u7AEF\u56DE\u6267\u5185\u5BB9\u4E0D\u4E00\u81F4\uFF0C\u5DF2\u6682\u505C\u4E2D\u8F6C\u3002");
      found.add(id);
    }
    const missing = rows.filter((r) => !found.has(r.id));
    if (missing.length) await this.env.DB.batch(missing.map((row) => this.env.DB.prepare(
      "UPDATE relay_requests SET publish_attempted_at=? WHERE id=? AND published_at IS NULL"
    ).bind(now, row.id)));
    await this.api.create(this.api.config.receipts, missing.map((r) => ({ requestId: r.id, envelope: r.envelope })));
    await this.env.DB.batch(rows.map((row) => this.env.DB.prepare("UPDATE relay_requests SET published_at=? WHERE id=?").bind(Date.now(), row.id)));
  }
  async beforeSend(id, version) {
    await this.poll(true);
    const path = `/v1/tasks/${encodeURIComponent(id)}`;
    const pending = this.seen.some((c) => c.method !== "GET" && (c.path === path && Number(c.body?.version) > version || c.path === path + "/act" && Number(c.body?.version) >= version && c.body?.action === "skip"));
    if (pending) throw new RelayFailure("\u68C0\u6D4B\u5230\u4FEE\u6539\u6216\u53D6\u6D88\uFF0C\u5DF2\u6682\u505C\u65E7\u7248\u672C\u90AE\u4EF6\uFF0C\u7B49\u5F85\u4E91\u7AEF\u786E\u8BA4\u3002");
  }
};

// src/index.ts
var feishuClient = (env) => new CloudFeishu(env, cloudBudgetFetch(env));
var json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "X-Content-Type-Options": "nosniff" }
});
async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function authorized(request, key2) {
  if (!key2 || key2.length < 32) return false;
  const supplied = request.headers.get("authorization") ?? "";
  if (!supplied.startsWith("Bearer ") || supplied.length > 1024) return false;
  const a = await digest(supplied.slice(7));
  const b = await digest(key2);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function readBody(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("\u8BF7\u4F7F\u7528 JSON \u8BF7\u6C42\u3002");
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const parts = [];
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 64e3) {
      await reader.cancel();
      throw new Error("\u8BF7\u6C42\u5185\u5BB9\u8FC7\u957F\u3002");
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  const body = JSON.parse(new TextDecoder().decode(all));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("\u8BF7\u6C42\u683C\u5F0F\u65E0\u6548\u3002");
  return body;
}
var identities = /* @__PURE__ */ new WeakMap();
function identity(env) {
  let result = identities.get(env);
  if (!result) {
    result = digest(JSON.stringify([
      "calendar-read-v2",
      env.QQ_SMTP_USER,
      env.QQ_SMTP_AUTH_CODE,
      env.FEISHU_APP_ID,
      env.FEISHU_APP_SECRET,
      env.TOKEN_ENCRYPTION_KEY,
      env.PUBLIC_URL,
      env.FREE_ENVIRONMENT_VERIFIED,
      env.RELAY_ENABLED,
      env.RELAY_APP_TOKEN,
      env.RELAY_COMMAND_TABLE,
      env.RELAY_RECEIPT_TABLE,
      env.RELAY_ENCRYPTION_KEY,
      env.RELAY_ENVIRONMENT_VERIFIED,
      env.EXTERNAL_EXECUTOR_KEY,
      env.SERVICE_EXECUTOR_ENABLED,
      env.SERVICE_EXECUTOR_KEY,
      env.SERVICE_CATALOG_VERSION
    ])).then((value) => Array.from(value).join(","));
    identities.set(env, result);
  }
  return result;
}
async function externalVerified(env) {
  const row = await env.DB.prepare("SELECT value FROM secrets WHERE id='executor_verification'").first();
  return !!env.EXTERNAL_EXECUTOR_KEY && row?.value === await identity(env);
}
async function health(env) {
  const row = await env.DB.prepare("SELECT value FROM secrets WHERE id='verification'").first();
  const verified = row?.value === await identity(env);
  const externalReady = env.EXTERNAL_EXECUTOR_ENABLED === "true" && env.EXTERNAL_EXECUTOR_VERIFIED === "true";
  const resourcesVerified = env.FREE_ENVIRONMENT_VERIFIED === "true" && env.RELAY_RESOURCE_STATUS !== "cpu_limit";
  const ready = resourcesVerified && (externalReady ? await externalVerified(env) : verified) && (env.RELAY_ENABLED !== "true" || env.RELAY_ENVIRONMENT_VERIFIED === "true" || externalReady);
  return {
    protocol: CLOUD_PROTOCOL,
    ready,
    resourcesVerified,
    transport: env.RELAY_ENABLED === "true" ? "feishu" : "direct",
    message: ready ? externalReady ? "GitHub \u4E91\u7AEF\u6267\u884C\u5DF2\u9A8C\u8BC1\uFF0C\u7EA6\u6BCF 5 \u5206\u949F\u68C0\u67E5\u53D1\u9001\uFF1B\u540C\u6B65\u786E\u8BA4\u53EF\u80FD\u9700\u8981 15\u201330 \u5206\u949F\uFF0C\u5E73\u53F0\u8C03\u5EA6\u53EF\u80FD\u5EF6\u8FDF\u3002" : "\u4E91\u7AEF\u8FDE\u63A5\u9A8C\u8BC1\u901A\u8FC7\uFF0C\u5DF2\u5141\u8BB8\u5206\u949F\u7EA7\u6267\u884C\u3002" : env.EXTERNAL_EXECUTOR_ENABLED === "true" && env.RELAY_RESOURCE_STATUS === "cpu_limit" ? "QQ SMTP \u548C\u98DE\u4E66\u8FDE\u63A5\u5DF2\u9A8C\u8BC1\uFF0C\u4F46 Cloudflare \u514D\u8D39 CPU \u9884\u7B97\u590D\u6D4B\u4ECD\u4E0D\u7A33\u5B9A\uFF0C\u4E91\u7AEF\u53D1\u9001\u5DF2\u6682\u505C\u3002" : env.EXTERNAL_EXECUTOR_ENABLED === "true" ? "\u5916\u90E8\u6267\u884C\u5668\u7684\u8FDE\u63A5\u3001\u6388\u6743\u6216\u514D\u8D39\u8D44\u6E90\u9A8C\u8BC1\u5C1A\u672A\u5B8C\u6210\u6216\u5DF2\u5931\u6548\uFF0C\u4E91\u7AEF\u53D1\u9001\u4FDD\u6301\u5173\u95ED\u3002" : env.RELAY_ENABLED === "true" && env.RELAY_ENVIRONMENT_VERIFIED !== "true" && env.RELAY_RESOURCE_STATUS === "cpu_limit" ? "\u98DE\u4E66\u4E2D\u8F6C\u514D\u8D39 CPU \u6267\u884C\u9884\u7B97\u5C1A\u672A\u8FBE\u6807\uFF0C\u4E91\u7AEF\u53D1\u9001\u5DF2\u6682\u505C\uFF1B\u8BF7\u52FF\u5F3A\u884C\u5F00\u542F\u8D44\u6E90\u9A8C\u8BC1\u5F00\u5173\u3002" : "\u5C1A\u672A\u5B8C\u6210 QQ SMTP\u3001\u98DE\u4E66\u65E5\u7A0B\u8BFB\u53D6\u6216\u514D\u8D39\u6267\u884C\u989D\u5EA6\u9A8C\u8BC1\uFF0C\u4E91\u7AEF\u53D1\u9001\u4FDD\u6301\u5173\u95ED\u3002"
  };
}
var worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      cloudEndpoint(env.PUBLIC_URL);
      if (url.pathname === "/oauth/callback" && request.method === "GET") {
        await feishuClient(env).finish(url.searchParams.get("code") ?? "", url.searchParams.get("state") ?? "");
        return new Response("\u4E91\u7AEF\u98DE\u4E66\u6388\u6743\u6210\u529F\u3002\u8BF7\u8FD4\u56DE\u684C\u5BA0\u9A8C\u8BC1\u4E91\u7AEF\u8FDE\u63A5\u3002", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
      }
      const executorPath = url.pathname.startsWith("/v1/executor/");
      if (!await authorized(request, executorPath ? env.EXTERNAL_EXECUTOR_KEY : env.ACCESS_KEY)) return json({ message: "\u4E91\u7AEF\u8BBF\u95EE\u51ED\u636E\u65E0\u6548\u3002" }, 401);
      const store = new CloudStore(env.DB);
      if (url.pathname === "/v1/executor/relay-token" && request.method === "POST") {
        const body2 = await readBody(request);
        if (env.RELAY_ENABLED === "true") await new CloudRelay(env, (incoming) => worker.fetch(incoming, env)).api.prepareToken(body2.verify === true);
        return json({ prepared: true });
      }
      if (url.pathname === "/v1/executor/relay-probe" && request.method === "POST") {
        if (env.RELAY_ENABLED !== "true") return json({ relay: true });
        const proof = await new CloudRelay(env, (incoming) => worker.fetch(incoming, env)).proof();
        return json({ relay: true, proof });
      }
      if (url.pathname === "/v1/executor/relay-work" && request.method === "POST") {
        if (env.RELAY_ENABLED === "true") await new CloudRelay(env, (incoming) => worker.fetch(incoming, env)).processQueued();
        return json({ processed: true });
      }
      if (url.pathname === "/v1/executor/relay-publish" && request.method === "POST") {
        if (env.RELAY_ENABLED === "true") await new CloudRelay(env, (incoming) => worker.fetch(incoming, env)).publishQueued();
        return json({ published: true });
      }
      if (url.pathname === "/v1/executor/prepare" && request.method === "POST") {
        const body2 = await readBody(request);
        if (body2.verify !== true) {
          if (env.EXTERNAL_EXECUTOR_ENABLED !== "true" || !(await health(env)).ready) return json({ message: "\u6267\u884C\u5668\u5C1A\u672A\u542F\u7528\u3002" }, 409);
          await store.recover(Date.now());
          if (!await store.dueCandidate(Date.now())) return json({ empty: true });
        }
        await feishuClient(env).token(body2.verify === true);
        return json({ prepared: true });
      }
      if (url.pathname === "/v1/executor/verify" && request.method === "POST") {
        const body2 = await readBody(request);
        const expected = Array.from(await digest(env.QQ_SMTP_USER + "\0" + env.QQ_SMTP_AUTH_CODE)).map((n) => n.toString(16).padStart(2, "0")).join("");
        if (body2.smtpFingerprint !== expected) return json({ message: "\u6267\u884C\u5668 SMTP \u914D\u7F6E\u4E0E\u4E91\u7AEF\u4E0D\u4E00\u81F4\u3002", code: "CONFIG_MISMATCH" }, 409);
        try {
          await feishuClient(env).verify();
        } catch (error) {
          await env.DB.prepare("DELETE FROM secrets WHERE id='executor_verification'").run();
          const message = error instanceof SafeCloudFailure ? error.message : "\u98DE\u4E66\u8BFB\u53D6\u9A8C\u8BC1\u5931\u8D25\u3002";
          return json({ smtp: true, feishu: false, message, code: message.includes("\u6388\u6743\u5DF2\u5931\u6548") ? "FEISHU_AUTH" : message.includes("\u6743\u9650") ? "FEISHU_PERMISSION" : "FEISHU_VERIFY" }, 409);
        }
        await env.DB.prepare("INSERT INTO secrets(id,value) VALUES ('executor_verification',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(await identity(env)).run();
        return json({ ...await health(env), smtp: true, feishu: true, checkedAt: Date.now() });
      }
      if (url.pathname === "/v1/relay/check" && request.method === "POST") {
        if (env.RELAY_ENABLED !== "true") return json({ message: "\u98DE\u4E66\u4E2D\u8F6C\u5C1A\u672A\u542F\u7528\u3002" }, 409);
        await new CloudRelay(env, (incoming) => worker.fetch(incoming, env)).poll(true);
        return json({ ...await health(env), checkedAt: Date.now() });
      }
      if (url.pathname === "/v1/executor/claim" && request.method === "POST") {
        if (env.EXTERNAL_EXECUTOR_ENABLED !== "true" || !(await health(env)).ready)
          return json({ message: "\u5916\u90E8\u6267\u884C\u5668\u5C1A\u672A\u5B8C\u6210\u9A8C\u8BC1\uFF0C\u4E91\u7AEF\u53D1\u9001\u4FDD\u6301\u5173\u95ED\u3002" }, 409);
        const body2 = await readBody(request);
        const relay = env.RELAY_ENABLED === "true" ? new CloudRelay(env, (incoming) => worker.fetch(incoming, env)) : void 0;
        const store2 = new CloudStore(env.DB);
        const now = Date.now();
        await store2.recover(now);
        const task = await store2.dueCandidate(now);
        if (!task) return json({ empty: true });
        const claim = crypto.randomUUID();
        if (!await store2.claim(task, claim, now)) return json({ empty: true });
        try {
          await relay?.checkProof(body2.relayProof, task.id, task.version);
          const live = await feishuClient(env).event(task.id);
          if (!live) {
            await store2.update(task, claim, "cancelled");
            return json({ empty: true });
          }
          refreshCloudTask(task, live);
          if (task.dueAt > now) {
            await store2.update(task, claim, "pending");
            return json({ empty: true });
          }
          const manualUntil = task.error?.startsWith("manual:") ? Number(task.error.slice(7)) : 0;
          if (!automaticCloudSend(task, now) && manualUntil <= now) {
            await store2.update(task, claim, "awaiting_confirmation", "\u5DF2\u9519\u8FC7\u53D1\u9001\u65F6\u95F4\u6216\u65E5\u7A0B\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u786E\u8BA4\u8865\u53D1\u6216\u8DF3\u8FC7\u3002");
            return json({ empty: true });
          }
          const recipients = requireEmailRecipients(task.event.emailRecipients, true).map((r) => r.email);
          const remaining = recipients.filter((r) => ![...task.accepted, ...task.rejected].some((a) => a.toLowerCase() === r.toLowerCase()));
          if (!remaining.length) {
            await store2.update(task, claim, task.rejected.length ? task.accepted.length ? "partial" : "failed" : "sent");
            return json({ empty: true });
          }
          await relay?.checkProof(body2.relayProof, task.id, task.version);
          const submitNow = Date.now();
          if (task.dueAt > submitNow) {
            await store2.update(task, claim, "pending");
            return json({ empty: true });
          }
          if (!automaticCloudSend(task, submitNow) && manualUntil <= submitNow) {
            await store2.update(task, claim, "awaiting_confirmation", "\u53D1\u9001\u524D\u65E5\u7A0B\u65F6\u95F4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u3002");
            return json({ empty: true });
          }
          const sendBefore = Math.floor(Math.min(now + 9e4, manualUntil > submitNow ? manualUntil : Math.min(task.dueAt + 15 * 6e4, Date.parse(task.event.endsAt ?? task.event.startsAt))));
          if (sendBefore <= submitNow) {
            await store2.update(task, claim, "awaiting_confirmation", "\u5DF2\u9519\u8FC7\u53D1\u9001\u65F6\u95F4\uFF0C\u8BF7\u786E\u8BA4\u8865\u53D1\u3002");
            return json({ empty: true });
          }
          const latest = await store2.get(task.id);
          if (!latest || latest.version !== task.version || latest.status !== "verifying") return json({ empty: true });
          const preview = buildEmailPreview(task.event);
          const attempt = {
            id: `${(/* @__PURE__ */ new Date()).toISOString()}_${crypto.randomUUID()}`,
            eventId: task.id,
            title: task.event.title,
            recipients: [remaining[0]],
            accepted: [],
            rejected: [],
            subject: preview.subject,
            text: preview.text,
            startedAt: (/* @__PURE__ */ new Date()).toISOString(),
            status: "sending"
          };
          if (!await store2.update(task, claim, "sending") || !await store2.beginAttempt(task, claim, attempt)) return json({ empty: true });
          return json({
            taskId: task.id,
            version: task.version,
            claim,
            attemptId: attempt.id,
            recipient: remaining[0],
            subject: preview.subject.replace(/[\r\n\0]/g, " "),
            text: preview.text,
            sendBefore
          });
        } catch (error) {
          await store2.update(task, claim, "paused", error instanceof SafeCloudFailure ? error.message : "\u65E5\u7A0B\u6838\u5B9E\u5931\u8D25\uFF0C\u5DF2\u6682\u505C\u53D1\u9001\u3002");
          return json({ empty: true });
        }
      }
      if (url.pathname === "/v1/executor/finish" && request.method === "POST") {
        const body2 = await readBody(request);
        if (typeof body2.taskId !== "string" || !/^feishu:[^\r\n]{1,400}:[^:\r\n]{1,200}$/.test(body2.taskId) || !Number.isSafeInteger(body2.version) || body2.version < 1 || typeof body2.claim !== "string" || !/^[0-9a-f-]{36}$/i.test(body2.claim) || typeof body2.attemptId !== "string" || !/^[^\r\n]{1,200}$/.test(body2.attemptId) || !["sent", "failed", "uncertain"].includes(body2.status) || body2.error !== void 0 && !["\u79DF\u7EA6\u5DF2\u8FC7\u671F\uFF0C\u672A\u63D0\u4EA4\u90AE\u4EF6\u3002", "\u90AE\u4EF6\u670D\u52A1\u5668\u660E\u786E\u62D2\u7EDD\u4E86\u672C\u6B21\u63D0\u4EA4\u3002", "SMTP \u8FDE\u63A5\u6216\u8BA4\u8BC1\u5931\u8D25\uFF0C\u672A\u63D0\u4EA4\u90AE\u4EF6\u3002", "SMTP \u63D0\u4EA4\u4E2D\u65AD\uFF0C\u53D1\u9001\u7ED3\u679C\u5F85\u6838\u5B9E\u3002"].includes(body2.error)) return json({ message: "\u6267\u884C\u7ED3\u679C\u65E0\u6548\u3002" }, 400);
        const result = await new CloudStore(env.DB).finishExternalAttempt(body2.taskId, body2.version, body2.claim, body2.attemptId, body2.status, body2.error);
        return json(result, result.ok ? 200 : 409);
      }
      if (url.pathname === "/v1/health" && request.method === "GET") return json(await health(env));
      if (url.pathname === "/v1/verify" && request.method === "POST") {
        if (env.EXTERNAL_EXECUTOR_ENABLED === "true") {
          const smtp2 = await externalVerified(env);
          let feishu2 = false;
          let feishuError2;
          try {
            await feishuClient(env).verify();
            feishu2 = true;
          } catch (error) {
            feishuError2 = error instanceof SafeCloudFailure ? error.message : "\u98DE\u4E66\u8BFB\u53D6\u5931\u8D25\uFF0C\u53D1\u9001\u5DF2\u6682\u505C\u3002";
            await env.DB.prepare("DELETE FROM secrets WHERE id='executor_verification'").run();
          }
          return json({ ...await health(env), smtp: smtp2, feishu: feishu2, feishuError: feishuError2, transport: "feishu" });
        }
        let smtp = false;
        let feishu = false;
        let smtpError;
        let feishuError;
        try {
          await new CloudSmtp(env).verify();
          smtp = true;
        } catch (error) {
          smtpError = error instanceof SafeCloudFailure ? error.message : "QQ SMTP \u8FDE\u63A5\u6216\u8BA4\u8BC1\u9A8C\u8BC1\u5931\u8D25\u3002";
        }
        try {
          await feishuClient(env).verify();
          feishu = true;
        } catch (error) {
          feishuError = error instanceof SafeCloudFailure ? error.message : "\u98DE\u4E66\u65E5\u5386\u8BFB\u53D6\u9A8C\u8BC1\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u4EE4\u724C\u52A0\u5BC6\u914D\u7F6E\u6216\u7A0D\u540E\u91CD\u8BD5\u3002";
        }
        if (smtp && feishu) await env.DB.prepare("INSERT INTO secrets (id,value) VALUES ('verification',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(await identity(env)).run();
        else await env.DB.prepare("DELETE FROM secrets WHERE id='verification'").run();
        return json({ ...await health(env), smtp, feishu, smtpError, feishuError, transport: env.RELAY_ENABLED === "true" ? "feishu" : "direct" });
      }
      if (url.pathname === "/v1/oauth/start" && request.method === "POST") return json({ url: await feishuClient(env).start() });
      const match = /^\/v1\/tasks\/([^/]+)(?:\/(attempts|act))?$/.exec(url.pathname);
      if (!match) return json({ message: "\u63A5\u53E3\u4E0D\u5B58\u5728\u3002" }, 404);
      const id = decodeURIComponent(match[1]);
      if (!/^feishu:[^\r\n]{1,400}:[^:\r\n]{1,200}$/.test(id)) return json({ message: "\u4EFB\u52A1 ID \u65E0\u6548\u3002" }, 400);
      if (match[2] === "attempts" && request.method === "GET") return json({ attempts: await store.attempts(id, url.searchParams.get("before") ?? void 0) });
      if (request.method === "GET" && !match[2]) {
        const task = await store.get(id);
        return task ? json({ task, attempts: await store.attempts(id) }) : json({ message: "\u4EFB\u52A1\u4E0D\u5B58\u5728\u3002" }, 404);
      }
      const body = await readBody(request);
      if (!Number.isSafeInteger(body.version) || body.version < 1) return json({ message: "\u4EFB\u52A1\u7248\u672C\u65E0\u6548\u3002" }, 400);
      if (request.method === "DELETE" && !match[2]) {
        const result = await store.cancel(id, body.version);
        return json(result, result.ok ? 200 : 409);
      }
      if (!(await health(env)).ready) return json({ message: "\u514D\u8D39\u8FD0\u884C\u73AF\u5883\u5C1A\u672A\u9A8C\u8BC1\uFF0C\u7981\u6B62\u63A5\u6536\u6216\u53D1\u9001\u8BA1\u5212\u3002" }, 503);
      if (request.method === "PUT" && !match[2]) {
        const plan = validateCloudPlan(body);
        if (plan.id !== id) return json({ message: "\u4EFB\u52A1\u6807\u8BC6\u4E0D\u4E00\u81F4\u3002" }, 400);
        const result = await store.upsert(plan);
        return json(result, result.ok ? 200 : 409);
      }
      if (request.method === "POST" && match[2] === "act") {
        if (!["send", "skip"].includes(body.action) || typeof body.confirmed !== "boolean") return json({ message: "\u64CD\u4F5C\u65E0\u6548\u3002" }, 400);
        const task = await store.get(id);
        if (!task || task.version !== body.version) return json({ message: "\u4EFB\u52A1\u7248\u672C\u5DF2\u53D8\u5316\u3002" }, 409);
        if (body.action === "send") {
          const live = await feishuClient(env).event(id);
          if (!live) return json({ message: "\u65E5\u7A0B\u5DF2\u5220\u9664\uFF0C\u4E0D\u80FD\u91CD\u53D1\u3002" }, 409);
          const remaining = requireEmailRecipients(task.event.emailRecipients, true).filter((r) => !task.accepted.some((a) => a.toLowerCase() === r.email.toLowerCase()));
          task.event = { ...task.event, ...live, emailRecipients: task.event.emailRecipients };
          task.dueAt = Date.parse(live.startsAt) - task.leadMs;
          task.event.emailReminderAt = new Date(task.dueAt).toISOString();
          const preview = buildEmailPreview({ ...task.event, emailRecipients: serializeEmailRecipients(remaining) });
          const expected = body.preview;
          if (!expected || JSON.stringify([preview.recipients, preview.subject, preview.text]) !== JSON.stringify([expected.recipients, expected.subject, expected.text])) {
            await env.DB.prepare("UPDATE tasks SET event=?,due_at=? WHERE id=? AND version=? AND status=?").bind(JSON.stringify(task.event), task.dueAt, id, body.version, task.status).run();
            return json({ task: await store.get(id), message: "\u65E5\u7A0B\u5185\u5BB9\u6216\u6536\u4EF6\u4EBA\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u9884\u89C8\u3002" }, 409);
          }
        }
        const relayRequest = request.headers.get("X-Pet-Relay-Request");
        const ok = await store.act(id, body.version, body.action, body.confirmed, relayRequest ? relayId(relayRequest) : void 0);
        return json({ task: await store.get(id), ok }, ok ? 200 : 409);
      }
      return json({ message: "\u64CD\u4F5C\u4E0D\u652F\u6301\u3002" }, 405);
    } catch (error) {
      return json({
        message: error instanceof SafeCloudFailure || error instanceof RelayFailure ? error.message : "\u8BF7\u6C42\u65E0\u6548\u6216\u4E91\u7AEF\u670D\u52A1\u6682\u4E0D\u53EF\u7528\u3002",
        ...url.pathname.startsWith("/v1/executor/") && error instanceof RelayFailure ? { code: "RELAY_" + error.kind.toUpperCase() } : {}
      }, 400);
    }
  },
  async scheduled(_controller, env) {
    try {
      if (env.SERVICE_EXECUTOR_ENABLED === "true") return;
      const relay = env.RELAY_ENABLED === "true" ? new CloudRelay(env, (request) => worker.fetch(request, env)) : void 0;
      if (env.EXTERNAL_EXECUTOR_ENABLED === "true") {
        await relay?.tick();
        return;
      }
      await relay?.poll();
      if (env.RELAY_ENABLED === "true" && env.RELAY_ENVIRONMENT_VERIFIED !== "true") return;
      if (!(await health(env)).ready) return;
      const store = new CloudStore(env.DB);
      await runCloudTick(store, {
        event: (id) => feishuClient(env).event(id),
        beforeSend: relay ? (id, version) => relay.beforeSend(id, version) : void 0,
        futureCheckInterval: relay ? 6 * 60 * 6e4 : void 0,
        send: (recipient, subject, text) => new CloudSmtp(env).send(recipient, subject, text)
      });
    } catch {
    }
  }
};
var index_default = worker;

// .generated/service-catalog.ts
var CATALOG_VERSION = "a4a9e81b8e8b3dc8f583afde14ab1d30c0eaf4d74ab335599f5f8fd21d5a6f07";
var CATALOG = {
  "00468501c100774e1c6b": {
    "sql": "UPDATE relay_requests SET published_at=? WHERE id=?",
    "params": 2,
    "read": false
  },
  "09afe6bd5c63c9280316": {
    "sql": "SELECT value FROM relay_state WHERE id='poll_at'",
    "params": 0,
    "read": true
  },
  "0c40fb9c8115b586b84c": {
    "sql": "INSERT OR IGNORE INTO relay_actions(id) SELECT ? FROM tasks WHERE id=? AND version=? AND status IN ('failed','partial','awaiting_confirmation','uncertain') AND (status!='uncertain' OR ?=1)",
    "params": 4,
    "read": false
  },
  "0ef3928a3d578f1d6350": {
    "sql": "UPDATE secrets SET value=? WHERE id='feishu' AND lease_id=?",
    "params": 2,
    "read": false
  },
  "1099e62b6e51f83edcf7": {
    "sql": "UPDATE secrets SET lease_until=0,lease_id=NULL WHERE id='feishu' AND lease_id=?",
    "params": 1,
    "read": false
  },
  "1323c3a4bca81dcda7f4": {
    "sql": "SELECT id FROM relay_requests WHERE response IS NOT NULL AND published_at IS NULL LIMIT 1",
    "params": 0,
    "read": true
  },
  "15f796a82f78986f39cd": {
    "sql": "UPDATE attempts SET status=?,completed_at=?,error=? WHERE id=? AND status='sending' AND executor_claim=?\n        AND EXISTS(SELECT id FROM tasks WHERE id=? AND version=? AND claim=? AND status='sending' AND lease_until>?)",
    "params": 9,
    "read": false
  },
  "166a006494638752a027": {
    "sql": "SELECT id FROM attempts WHERE id=?",
    "params": 1,
    "read": true
  },
  "1eb0a0970a08af2180ca": {
    "sql": "INSERT INTO secrets(id,value) VALUES ('executor_verification',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    "params": 1,
    "read": false
  },
  "2003991f1b121c114c19": {
    "sql": "UPDATE relay_state SET value=0 WHERE id='poll_lease'",
    "params": 0,
    "read": false
  },
  "276f0ca169908da28f24": {
    "sql": "SELECT * FROM attempts WHERE task_id=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT 30",
    "params": 3,
    "read": true
  },
  "27e93470848283aabb20": {
    "sql": "UPDATE relay_usage SET used=used+1 WHERE month=? AND used<6000 AND exhausted=0",
    "params": 1,
    "read": false
  },
  "2c1a6e73dd9cc2876459": {
    "sql": "UPDATE tasks SET accepted=?,rejected=?,status=?,error=?,updated_at=?,claim=NULL WHERE id=? AND version=? AND claim=?",
    "params": 8,
    "read": false
  },
  "2dd7f41ac16fbdfc1073": {
    "sql": "UPDATE relay_requests SET publish_attempted_at=? WHERE id=? AND published_at IS NULL",
    "params": 2,
    "read": false
  },
  "391e6230b6128b0ed92a": {
    "sql": "SELECT value FROM secrets WHERE id='verification'",
    "params": 0,
    "read": true
  },
  "3fdd0e73f1c9157315af": {
    "sql": "UPDATE secrets SET value='' WHERE id='feishu'",
    "params": 0,
    "read": false
  },
  "41049211e8697b20e5b0": {
    "sql": "INSERT OR IGNORE INTO relay_requests(id,command,created_at) VALUES (?,?,?)",
    "params": 3,
    "read": false
  },
  "4230ea235de57b0cc2d8": {
    "sql": "UPDATE relay_requests SET response=?,envelope=?,completed_at=?,lease_until=0,lease_id=NULL WHERE id=? AND lease_id=?",
    "params": 5,
    "read": false
  },
  "43ec51fcf7f45ae88c59": {
    "sql": "INSERT OR IGNORE INTO secrets (id,value) VALUES ('feishu','')",
    "params": 0,
    "read": false
  },
  "44543490347318456eb3": {
    "sql": "UPDATE attempts SET status='uncertain',error='\u53D1\u9001\u4E2D\u65AD\uFF0C\u7ED3\u679C\u5F85\u6838\u5B9E' WHERE status='sending' AND task_id IN (SELECT id FROM tasks WHERE status='sending' AND lease_until<?)",
    "params": 1,
    "read": false
  },
  "4817ed61f575ed164280": {
    "sql": "UPDATE secrets SET lease_until=?,lease_id=? WHERE id='feishu' AND lease_until<?",
    "params": 3,
    "read": false
  },
  "485afe466ee3bf76c9c8": {
    "sql": "SELECT * FROM tasks WHERE status IN ('pending','paused') AND\n      ((due_at<=? AND checked_at<=?) OR checked_at<=?) ORDER BY checked_at ASC,due_at ASC LIMIT 1",
    "params": 3,
    "read": true
  },
  "4dd8ae09ddc0ddc1c61e": {
    "sql": "INSERT INTO relay_state(id,value) VALUES ('poll_at',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    "params": 1,
    "read": false
  },
  "5343659d1d81e5c06c02": {
    "sql": "UPDATE secrets SET value=?,lease_until=0,lease_id=NULL WHERE id='feishu' AND lease_id=?",
    "params": 2,
    "read": false
  },
  "53e95ebd78ddd5ef9822": {
    "sql": "UPDATE tasks SET status='pending',claim=NULL WHERE status='verifying' AND lease_until<?",
    "params": 1,
    "read": false
  },
  "545a5ad47db2db834a52": {
    "sql": "INSERT INTO tasks (id,version,event,plan,lead_ms,due_at,status,updated_at) VALUES (?,?,'{}','{}',0,0,'cancelled',?)\n      ON CONFLICT(id) DO UPDATE SET version=excluded.version,status='cancelled',updated_at=excluded.updated_at,error=NULL,claim=NULL\n      WHERE tasks.version < excluded.version AND tasks.status NOT IN ('sending','uncertain','sent')",
    "params": 3,
    "read": false
  },
  "57bf0c5ced0e78f55d9a": {
    "sql": "SELECT id FROM oauth_states WHERE id=? AND expires_at>?",
    "params": 2,
    "read": true
  },
  "60ad31aea9b32c701e74": {
    "sql": "INSERT INTO secrets(id,value) VALUES ('relay_tenant',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    "params": 1,
    "read": false
  },
  "60e39e6e399f2c0b2670": {
    "sql": "SELECT value FROM secrets WHERE id='relay_tenant'",
    "params": 0,
    "read": true
  },
  "60fafade5cc236588e2d": {
    "sql": "SELECT * FROM relay_requests WHERE response IS NOT NULL AND published_at IS NULL ORDER BY created_at LIMIT ?",
    "params": 1,
    "read": true
  },
  "61c25445118402539c9f": {
    "sql": "SELECT * FROM tasks WHERE id=? AND version=? AND claim=? AND status='sending' AND lease_until>?",
    "params": 4,
    "read": true
  },
  "668fe4969f2d935ee024": {
    "sql": "DELETE FROM oauth_states WHERE expires_at<?",
    "params": 1,
    "read": false
  },
  "6989b6baf69682f93309": {
    "sql": "UPDATE tasks SET status='uncertain',error='\u53D1\u9001\u4E2D\u65AD\uFF0C\u7ED3\u679C\u5F85\u6838\u5B9E',claim=NULL WHERE status='sending' AND lease_until<?",
    "params": 1,
    "read": false
  },
  "6d25a098d3e4b68ea95b": {
    "sql": "SELECT * FROM relay_requests WHERE id=?",
    "params": 1,
    "read": true
  },
  "6e88cfa90086c17cfd78": {
    "sql": "DELETE FROM oauth_states WHERE id=? AND expires_at>?",
    "params": 2,
    "read": false
  },
  "738e578594165f1883d2": {
    "sql": "INSERT INTO oauth_states (id,expires_at) VALUES (?,?)",
    "params": 2,
    "read": false
  },
  "756df305ad38ca1e36b8": {
    "sql": "INSERT INTO relay_state(id,value) VALUES ('poll_lease',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE relay_state.value<?",
    "params": 2,
    "read": false
  },
  "7cefcf537597d8902106": {
    "sql": "UPDATE relay_requests SET lease_until=0,lease_id=NULL WHERE id=? AND lease_id=?",
    "params": 2,
    "read": false
  },
  "8b2bb55c5ed6d208f41b": {
    "sql": "SELECT plan FROM tasks WHERE id=?",
    "params": 1,
    "read": true
  },
  "8d16380d876556913d7d": {
    "sql": "UPDATE attempts SET status=?,completed_at=?,error=? WHERE id=?",
    "params": 4,
    "read": false
  },
  "9024a9d3b4e3ff861fa4": {
    "sql": "UPDATE tasks SET status='verifying',claim=?,lease_until=? WHERE id=? AND version=? AND status=?",
    "params": 5,
    "read": false
  },
  "9233290a0bbad0d5a644": {
    "sql": "UPDATE relay_usage SET exhausted=1 WHERE month=?",
    "params": 1,
    "read": false
  },
  "9a0c3e63ee17976b32b0": {
    "sql": "SELECT * FROM attempts WHERE id=? AND task_id=? AND version=? AND executor_claim=?",
    "params": 4,
    "read": true
  },
  "9e1ef39640c3b1e46d78": {
    "sql": "DELETE FROM secrets WHERE id='relay_tenant' AND value=?",
    "params": 1,
    "read": false
  },
  "9f8d7d41bad4fb19a76c": {
    "sql": "INSERT INTO secrets(id,value) VALUES ('executor_relay_proof',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    "params": 1,
    "read": false
  },
  "9f8fe50eb9271a6f4b47": {
    "sql": "UPDATE tasks SET accepted=?,rejected=?,status=?,error=?,updated_at=?,checked_at=0,claim=NULL\n        WHERE id=? AND version=? AND claim=? AND status='sending' AND EXISTS(SELECT id FROM attempts WHERE id=? AND executor_claim=? AND status=? AND completed_at=?)",
    "params": 12,
    "read": false
  },
  "a2d795b1d2d1e36b397a": {
    "sql": "UPDATE tasks SET status=?,checked_at=0,rejected='[]',error=?,updated_at=? WHERE id=? AND version=? AND status IN ('failed','partial','awaiting_confirmation','uncertain') AND (status!='uncertain' OR ?=1) AND EXISTS(SELECT id FROM relay_actions WHERE id=?)",
    "params": 7,
    "read": false
  },
  "a4789fb19f9102865250": {
    "sql": "INSERT INTO tasks (id,version,event,plan,lead_ms,due_at,status,updated_at) VALUES (?,?,?,?,?,?,'pending',?)\n      ON CONFLICT(id) DO UPDATE SET version=excluded.version,event=excluded.event,plan=excluded.plan,lead_ms=excluded.lead_ms,\n      due_at=excluded.due_at,status='pending',rejected='[]',error=NULL,updated_at=excluded.updated_at,checked_at=0\n      WHERE tasks.version < excluded.version AND tasks.status NOT IN ('sending','sent','uncertain','verifying') AND tasks.accepted='[]'",
    "params": 7,
    "read": false
  },
  "ace5279bc2c47b91a220": {
    "sql": "INSERT INTO relay_requests(id,command,created_at,command_envelope,command_key_hash)\n        VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET command_envelope=excluded.command_envelope,command_key_hash=excluded.command_key_hash\n        WHERE relay_requests.command=excluded.command",
    "params": 5,
    "read": false
  },
  "ade431571f19ec00789c": {
    "sql": "INSERT INTO attempts (id,task_id,version,recipient,title,subject,body,started_at,status,executor_claim)\n      SELECT ?,?,?,?,?,?,?,?,'sending',? FROM tasks WHERE id=? AND version=? AND claim=? AND status='sending'",
    "params": 12,
    "read": false
  },
  "b258ab0ea1e07115f647": {
    "sql": "SELECT value FROM secrets WHERE id='executor_verification'",
    "params": 0,
    "read": true
  },
  "c23b9b84f2fea4e90f27": {
    "sql": "SELECT id FROM relay_actions WHERE id=?",
    "params": 1,
    "read": true
  },
  "c2c913e8a971de899046": {
    "sql": "SELECT value FROM secrets WHERE id='executor_relay_proof'",
    "params": 0,
    "read": true
  },
  "c2fe36eb69b0ed819824": {
    "sql": "UPDATE relay_requests SET lease_id=?,lease_until=? WHERE id=? AND response IS NULL AND lease_until<?",
    "params": 4,
    "read": false
  },
  "c50df9bfc2bf6958f118": {
    "sql": "SELECT id FROM relay_requests WHERE response IS NULL AND command_envelope IS NOT NULL LIMIT 1",
    "params": 0,
    "read": true
  },
  "cab6e14a1705f66872c2": {
    "sql": "DELETE FROM secrets WHERE id='executor_verification'",
    "params": 0,
    "read": false
  },
  "d2b7c742d1615fdb1056": {
    "sql": "UPDATE tasks SET event=?,due_at=? WHERE id=? AND version=? AND status=?",
    "params": 5,
    "read": false
  },
  "d4c32aabd8723f52a093": {
    "sql": "SELECT * FROM tasks WHERE status IN ('pending','paused') AND due_at<=? AND checked_at<=?\n      ORDER BY due_at ASC,checked_at ASC LIMIT 1",
    "params": 2,
    "read": true
  },
  "de0f821ade7269435671": {
    "sql": "UPDATE relay_requests SET envelope=? WHERE id=? AND envelope IS NULL",
    "params": 2,
    "read": false
  },
  "dea4c90922410efd6ea3": {
    "sql": "DELETE FROM secrets WHERE id='verification'",
    "params": 0,
    "read": false
  },
  "ded86d20dfd035d23242": {
    "sql": "UPDATE tasks SET event=?,due_at=?,status=?,accepted=?,error=?,updated_at=?,checked_at=?,\n      claim=CASE WHEN ? IN ('sending','verifying') THEN claim ELSE NULL END WHERE id=? AND version=? AND claim=?",
    "params": 11,
    "read": false
  },
  "e0c736cf2f6c10c05257": {
    "sql": "INSERT OR IGNORE INTO relay_usage(month) VALUES (?)",
    "params": 1,
    "read": false
  },
  "ebf71f9246d8ae8e2e76": {
    "sql": "SELECT command FROM relay_requests WHERE response IS NULL AND command_envelope IS NOT NULL ORDER BY created_at,id LIMIT 1",
    "params": 0,
    "read": true
  },
  "f1e3b0e89c752bc169c9": {
    "sql": "SELECT value FROM secrets WHERE id='feishu'",
    "params": 0,
    "read": true
  },
  "f9479703e369329bae45": {
    "sql": "UPDATE tasks SET status=?,checked_at=0,rejected='[]',error=?,updated_at=? WHERE id=? AND version=? AND status IN ('failed','partial','awaiting_confirmation','uncertain') AND (status!='uncertain' OR ?=1)",
    "params": 6,
    "read": false
  },
  "fbd179a1b627228c2001": {
    "sql": "SELECT id,command,response,command_envelope,command_key_hash FROM relay_requests WHERE id IN (SELECT value FROM json_each(?))",
    "params": 1,
    "read": true
  },
  "fdfa8c0b633e8a169b59": {
    "sql": "INSERT INTO secrets (id,value) VALUES ('verification',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    "params": 1,
    "read": false
  },
  "fe234f1aa9a744d745c7": {
    "sql": "SELECT * FROM tasks WHERE id=?",
    "params": 1,
    "read": true
  }
};

// src/remote-database.ts
var bySql = new Map(Object.entries(CATALOG).map(([op, entry]) => [entry.sql, op]));
function remoteDatabase(call) {
  class RemoteStatement {
    constructor(op, params = []) {
      this.op = op;
      this.params = params;
    }
    op;
    params;
    bind(...params) {
      return new RemoteStatement(this.op, params);
    }
    descriptor(mode) {
      return { op: this.op, params: this.params, mode };
    }
    async invoke(mode) {
      const result = await call("/v1/service/state", { catalogVersion: CATALOG_VERSION, batch: false, operations: [this.descriptor(mode)] });
      if (!Array.isArray(result?.values) || result.values.length !== 1) throw new Error("SERVICE_STATE");
      return result.values[0];
    }
    first() {
      return this.invoke("first");
    }
    all() {
      return this.invoke("all");
    }
    run() {
      return this.invoke("run");
    }
  }
  return {
    prepare(sql) {
      const op = bySql.get(sql);
      if (!op) throw new Error("SERVICE_OPERATION");
      return new RemoteStatement(op);
    },
    async batch(statements) {
      if (!statements.length) return [];
      if (statements.some((s) => !(s instanceof RemoteStatement))) throw new Error("SERVICE_OPERATION");
      const operations = statements.map((s) => s.descriptor("run"));
      const value = await call("/v1/service/state", { catalogVersion: CATALOG_VERSION, batch: true, operations });
      if (!Array.isArray(value?.values) || value.values.length !== operations.length) throw new Error("SERVICE_STATE");
      return value.values;
    }
  };
}

// src/service-core.ts
function createRuntime(settings, call) {
  const env = { ...settings, DB: remoteDatabase(call), SERVICE_CATALOG_VERSION: CATALOG_VERSION };
  if (env.SERVICE_EXECUTOR_ENABLED !== "true" || env.EXTERNAL_EXECUTOR_ENABLED !== "true") throw new Error("SERVICE_DISABLED");
  const dispatch = (request) => index_default.fetch(request, env);
  const relay = new CloudRelay(env, dispatch);
  return {
    async api(path, body = {}) {
      const response = await dispatch(new Request("https://executor.internal" + path, {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.EXTERNAL_EXECUTOR_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }));
      const value = await response.json();
      if (!response.ok) throw new Error(value.code ?? "CLOUD_HTTP_" + response.status);
      return value;
    },
    async synchronize(force = false) {
      await relay.api.prepareToken();
      await relay.poll(force, true);
      for (let i = 0; i < 20; i++) if (!await relay.processQueued()) break;
      await relay.publishQueued(20);
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CATALOG_VERSION,
  createRuntime,
  remoteDatabase
});
