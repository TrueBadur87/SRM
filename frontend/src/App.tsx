import React, { useEffect, useMemo, useState } from "react";
import { api, Client, Recruiter, Vacancy, PipelineRow, Payment, User } from "./api";

// Define the available tabs and themes in the UI
type Theme = "dark" | "light";
type Tab = "Воронка" | "Клиенты" | "Вакансии" | "Рекрутеры" | "Отчеты" | "Пользователи";

// Utility for rendering a status badge with appropriate colours
const badge = (status: string) => {
  const base = "px-2 py-1 rounded-full text-xs font-medium";
  if (status === "hired") return `${base} bg-emerald-500/15 text-emerald-200 border border-emerald-500/25`;
  if (status === "rejected") return `${base} bg-rose-500/15 text-rose-200 border border-rose-500/25`;
  if (status === "in_process") return `${base} bg-sky-500/15 text-sky-200 border border-sky-500/25`;
  return `${base} bg-slate-500/15 text-slate-200 border border-slate-500/25`;
};

// Simple card component used to display metrics
function Card(props: { title: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
      <div className="text-sm text-slate-300">{props.title}</div>
      <div className="mt-2 text-2xl font-semibold">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-slate-400">{props.hint}</div> : null}
    </div>
  );
}

// Modal component with overlay and close action
function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={props.onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="text-lg font-semibold">{props.title}</div>
          <button
            className="rounded-xl px-3 py-1 text-slate-300 hover:bg-white/5"
            onClick={props.onClose}
          >
            Закрыть
          </button>
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

// Styled input component
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none " +
        "placeholder:text-slate-500 focus:border-sky-500/40"
      }
    />
  );
}

// Styled select component
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none " +
        "focus:border-sky-500/40"
      }
    />
  );
}

// Styled button component with variants
function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }
) {
  const v = props.variant || "primary";
  const base = "rounded-xl px-3 py-2 text-sm font-medium transition border";
  const cls =
    v === "primary"
      ? `${base} bg-sky-500/20 border-sky-500/30 text-sky-100 hover:bg-sky-500/25`
      : v === "danger"
      ? `${base} bg-rose-500/15 border-rose-500/25 text-rose-100 hover:bg-rose-500/20`
      : `${base} bg-transparent border-white/10 text-slate-200 hover:bg-white/5`;
  return (
    <button {...props} className={cls + " " + (props.className || "")} />
  );
}

// Utility to download data as CSV from an array of objects
function downloadCSV(filename: string, rows: Array<Record<string, unknown>>) {
  // 1) Collect columns
  const colSet = rows.reduce<Set<string>>((acc, row) => {
    for (const key of Object.keys(row)) acc.add(key);
    return acc;
  }, new Set<string>());

  const cols = Array.from(colSet);

  // 2) Escape CSV values
  const escape = (value: unknown) => {
    const str = value == null ? "" : String(value);
    return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  // 3) Build CSV
  const csv =
    [cols.join(";"), ...rows.map((r) => cols.map((c) => escape(r[c])).join(";"))].join("\n");

  // 4) Download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
const THEME_KEY = "crm.theme";
const TOKEN_KEY = "crm.token";
const REMEMBER_KEY = "crm.remember";
const TIPS = [
  "Лайфхак: оплата теперь “правильная” через платежи — можно разбивать на части. Воронка показывает сумму всех платежей и последнюю дату.",
  "Совет: если всё вводить правильно с первого раза, потом не придётся ничего менять.",
  "Совет: добавляй заметки сразу — через неделю детали забудутся.",
  "Лайфхак: фильтры в воронке можно комбинировать, чтобы быстро найти нужные заявки.",
  "Совет: сначала заполни клиента и рекрутера, потом добавляй вакансии — так меньше ошибок.",
  "Лайфхак: для замен используйте пометку “replacement”, чтобы не потерять историю.",
];


export default function App() {
  // Active tab state
  const [tab, setTab] = useState<Tab>("Воронка");

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  });

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [openSettings, setOpenSettings] = useState(false);
  const [rememberUser, setRememberUser] = useState(() => localStorage.getItem(REMEMBER_KEY) === "true");


  // Master data lists
  const [clients, setClients] = useState<Client[]>([]);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);

  // Filters for the pipeline
  const [filters, setFilters] = useState<{ client_id?: number; recruiter_id?: number; status?: string; search?: string }>({});
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], [tab]);

  // Modal state for adding and editing applications
  const [openAddApp, setOpenAddApp] = useState(false);
  const [openEditApp, setOpenEditApp] = useState<PipelineRow | null>(null);

  // Payment list and form for editing payments
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payForm, setPayForm] = useState({ paid_date: new Date().toISOString().slice(0, 10), amount: 0, note: "" });

  // Forms for creating new clients/recruiters/vacancies
  const [newClientName, setNewClientName] = useState("");
  const [newRecruiterName, setNewRecruiterName] = useState("");
  const [newVacancyTitle, setNewVacancyTitle] = useState("");
  const [newVacancyClientId, setNewVacancyClientId] = useState<number | "">("");
  const [newVacancyFee, setNewVacancyFee] = useState<number>(0);
  const [newVacancyCity, setNewVacancyCity] = useState("");
  const [openEditClient, setOpenEditClient] = useState<Client | null>(null);
  const [editClientName, setEditClientName] = useState("");
  const [openEditRecruiter, setOpenEditRecruiter] = useState<Recruiter | null>(null);
  const [editRecruiterName, setEditRecruiterName] = useState("");
  const [openEditVacancy, setOpenEditVacancy] = useState<Vacancy | null>(null);
  const [editVacancyTitle, setEditVacancyTitle] = useState("");
  const [editVacancyClientId, setEditVacancyClientId] = useState<number | "">("");
  const [editVacancyFee, setEditVacancyFee] = useState<number>(0);
  const [editVacancyCity, setEditVacancyCity] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" as "admin" | "user", recruiter_id: "" as number | "" });
  const [openEditUser, setOpenEditUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState({ username: "", password: "", role: "user" as "admin" | "user", recruiter_id: "" as number | "" });


  // Application form initial values
  const today = new Date().toISOString().slice(0, 10);
  const [addForm, setAddForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    notes: "",
    client_id: "" as number | "",
    vacancy_id: "" as number | "",
    recruiter_id: "" as number | "",
    date_contacted: today,
    status: "new" as PipelineRow["status"],
    rejection_date: "",
    start_date: "",
    paid: false,
    paid_date: "",
    payment_amount: 0,
    is_replacement: false,
    replacement_of_id: "" as number | "",
    replacement_note: "",
  });

  // Loading and error state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch all master data
  async function refreshAll() {
    setErr(null);
    try {
      const [c, r, v] = await Promise.all([api.clients(), api.recruiters(), api.vacancies()]);
      setClients(c);
      setRecruiters(r);
      setVacancies(v);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  // Fetch pipeline data with current filters
  async function refreshPipeline() {
    setErr(null);
    try {
      const rows = await api.pipeline(filters);
      setPipeline(rows);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  const getStoredToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

  // Auth bootstrap
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    api
      .me()
      .then((u) => setAuthUser(u))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  async function handleLogin() {
    setLoginError(null);
    if (!loginForm.username.trim() || !loginForm.password) {
      setLoginError("Введите логин и пароль");
      return;
    }
    setAuthBusy(true);
    try {
      const res = await api.login(loginForm.username.trim(), loginForm.password);
      localStorage.setItem("crm.token", res.token);
      setAuthUser(res.user);
      setLoginForm({ username: "", password: "" });
    } catch (e: any) {
      setLoginError(String(e?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    if (!confirm("����� �� �������?")) return;
    localStorage.removeItem("crm.token");
    setAuthUser(null);
    setTab("Воронка");
  }

  // Initial load of master data
  useEffect(() => {
    if (authUser) refreshAll();
  }, [authUser?.id]);

  // Refresh pipeline whenever filters change
  useEffect(() => {
    if (authUser) refreshPipeline();
  }, [authUser?.id, filters.client_id, filters.recruiter_id, filters.status, filters.search]);
  // Lock recruiter to current user for non-admin accounts
  useEffect(() => {
    if (authUser && authUser.role !== "admin") {
      setAddForm((f) => ({ ...f, recruiter_id: authUser.recruiter_id || "" }));
    }
  }, [authUser?.id, authUser?.role, authUser?.recruiter_id]);

  // Apply and persist theme selection
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(REMEMBER_KEY, String(rememberUser));
  }, [rememberUser]);

  useEffect(() => {
    if (!authUser) return;
    const token = getStoredToken();
    if (!token) return;
    if (rememberUser) {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.setItem(TOKEN_KEY, token);
    }
  }, [rememberUser, authUser?.id]);

  useEffect(() => {
    const handler = () => {
      if (!rememberUser) {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [rememberUser]);

  // Filter vacancies based on selected client for add form
  const filteredVacancies = useMemo(() => {
    if (!addForm.client_id) return vacancies;
    return vacancies.filter((v) => v.client_id === addForm.client_id);
  }, [vacancies, addForm.client_id]);

  // Filter vacancies list in the Vacancies tab by selected client (if any)
  const vacanciesForClient = useMemo(() => {
    if (!newVacancyClientId) return vacancies;
    return vacancies.filter((v) => v.client_id === newVacancyClientId);
  }, [vacancies, newVacancyClientId]);

  // Determine the selected vacancy to auto-fill payment amount when initial payment is created
  const selectedVacancy = useMemo(() => {
    if (!addForm.vacancy_id) return null;
    return vacancies.find((v) => v.id === addForm.vacancy_id) || null;
  }, [vacancies, addForm.vacancy_id]);

  // Auto-set payment amount when toggling the 'paid' checkbox in add form
  useEffect(() => {
    if (selectedVacancy && addForm.paid && (!addForm.payment_amount || addForm.payment_amount === 0)) {
      setAddForm((f) => ({ ...f, payment_amount: selectedVacancy.fee_amount || 0 }));
    }
  }, [selectedVacancy, addForm.paid]);

  // Compute summary statistics for the pipeline
  const stats = useMemo(() => {
    const total = pipeline.length;
    const hired = pipeline.filter((p) => p.status === "hired").length;
    const paidCount = pipeline.filter((p) => p.paid).length;
    const paidSum = pipeline.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
    return { total, hired, paidCount, paidSum: Math.round(paidSum * 100) / 100 };
  }, [pipeline]);

  // Create a client
  async function addClient() {
    if (!newClientName.trim()) return;
    setLoading(true);
    try {
      await api.createClient(newClientName.trim());
      setNewClientName("");
      await refreshAll();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Create a recruiter
  async function addRecruiter() {
    if (!newRecruiterName.trim()) return;
    setLoading(true);
    try {
      await api.createRecruiter(newRecruiterName.trim());
      setNewRecruiterName("");
      await refreshAll();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Open edit forms
  function openClientEdit(client: Client) {
    setErr(null);
    setOpenEditClient(client);
    setEditClientName(client.name);
  }

  function openRecruiterEdit(recruiter: Recruiter) {
    setErr(null);
    setOpenEditRecruiter(recruiter);
    setEditRecruiterName(recruiter.name);
  }

  function openVacancyEdit(vacancy: Vacancy) {
    setErr(null);
    setOpenEditVacancy(vacancy);
    setEditVacancyTitle(vacancy.title);
    setEditVacancyClientId(vacancy.client_id);
    setEditVacancyFee(vacancy.fee_amount || 0);
    setEditVacancyCity(vacancy.city || "");
  }

  // ЛогинРоль edited client or recruiter
  async function saveEditClient() {
    if (!openEditClient) return;
    const name = editClientName.trim();
    if (!name) return setErr("Введите имя клиента");
    setLoading(true);
    try {
      await api.updateClient(openEditClient.id, name);
      setOpenEditClient(null);
      await refreshAll();
      await refreshPipeline();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function saveEditRecruiter() {
    if (!openEditRecruiter) return;
    const name = editRecruiterName.trim();
    if (!name) return setErr("Введите имя рекрутера");
    setLoading(true);
    try {
      await api.updateRecruiter(openEditRecruiter.id, name);
      setOpenEditRecruiter(null);
      await refreshAll();
      await refreshPipeline();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function saveEditVacancy() {
    if (!openEditVacancy) return;
    const title = editVacancyTitle.trim();
    if (!title) return setErr("Введите название вакансии");
    if (!editVacancyClientId) return setErr("Выберите клиента");
    setLoading(true);
    try {
      await api.updateVacancy(openEditVacancy.id, {
        client_id: Number(editVacancyClientId),
        title,
        fee_amount: Number(editVacancyFee || 0),
        city: editVacancyCity.trim() || null,
      });
      setOpenEditVacancy(null);
      await refreshAll();
      await refreshPipeline();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshUsers() {
    if (authUser?.role !== "admin") return;
    setErr(null);
    try {
      const list = await api.users();
      setUsers(list);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  function openUserEdit(user: User) {
    setErr(null);
    setOpenEditUser(user);
    setEditUser({
      username: user.username,
      password: "",
      role: user.role,
      recruiter_id: user.recruiter_id ?? "",
    });
  }

  async function createUser() {
    setErr(null);
    if (!newUser.username.trim() || !newUser.password) {
      return setErr("Введите логин и пароль");
    }
    if (newUser.role !== "admin" && !newUser.recruiter_id) {
      return setErr("Для пользователя нужен рекрутер");
    }
    setLoading(true);
    try {
      await api.createUser({
        username: newUser.username.trim(),
        password: newUser.password,
        role: newUser.role,
        recruiter_id: newUser.role === "admin" ? null : Number(newUser.recruiter_id),
      });
      setNewUser({ username: "", password: "", role: "user", recruiter_id: "" });
      await refreshUsers();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function saveEditUser() {
    if (!openEditUser) return;
    if (!editUser.username.trim()) return setErr("Введите логин");
    if (editUser.role !== "admin" && !editUser.recruiter_id) {
      return setErr("Для пользователя нужен рекрутер");
    }
    setLoading(true);
    try {
      await api.updateUser(openEditUser.id, {
        username: editUser.username.trim(),
        password: editUser.password || undefined,
        role: editUser.role,
        recruiter_id: editUser.role === "admin" ? null : Number(editUser.recruiter_id),
      });
      setOpenEditUser(null);
      await refreshUsers();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(id: number) {
    if (!confirm("Удалить пользователя?")) return;
    setLoading(true);
    try {
      await api.deleteUser(id);
      await refreshUsers();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Create a vacancy
  async function addVacancy() {
    if (!newVacancyTitle.trim() || !newVacancyClientId) return;
    setLoading(true);
    try {
      await api.createVacancy({ client_id: Number(newVacancyClientId), title: newVacancyTitle.trim(), fee_amount: Number(newVacancyFee || 0), city: newVacancyCity.trim() || null });
      setNewVacancyTitle("");
      setNewVacancyFee(0);
      setNewVacancyCity("");
      await refreshAll();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Submit a new application (creates candidate and application)
  async function submitAddApplication() {
    setErr(null);
    if (!addForm.full_name.trim()) return setErr("Введите имя кандидата");
    if (!addForm.vacancy_id) return setErr("Выберите вакансию");
    if (!addForm.recruiter_id) return setErr("Выберите рекрутера");
    // Validate status-specific fields
    if (addForm.status === "rejected" && !addForm.rejection_date) return setErr("Для rejected нужна дата отказа");
    if (addForm.status === "hired" && !addForm.start_date) return setErr("Для hired нужна дата выхода");
    if (addForm.paid && !addForm.paid_date) return setErr("Если оплачено, укажи дату платежа");

    setLoading(true);
    try {
      // 1) Create candidate
      const candidate = await api.createCandidate({
        full_name: addForm.full_name.trim(),
        phone: addForm.phone || null,
        email: addForm.email || null,
        notes: addForm.notes || null,
      });
      // 2) Create application with optional initial payment
      await api.createApplication({
        candidate_id: candidate.id,
        vacancy_id: Number(addForm.vacancy_id),
        recruiter_id: Number(addForm.recruiter_id),
        date_contacted: addForm.date_contacted,
        status: addForm.status,
        rejection_date: addForm.rejection_date ? addForm.rejection_date : null,
        start_date: addForm.start_date ? addForm.start_date : null,
        paid: addForm.paid,
        paid_date: addForm.paid_date ? addForm.paid_date : null,
        payment_amount: Number(addForm.payment_amount || 0),
        is_replacement: addForm.is_replacement,
        replacement_of_id: addForm.replacement_of_id ? Number(addForm.replacement_of_id) : null,
        replacement_note: addForm.replacement_note || null,
      });
      // Reset form and refresh pipeline
      setOpenAddApp(false);
      setAddForm({
        full_name: "",
        phone: "",
        email: "",
        notes: "",
        client_id: "",
        vacancy_id: "",
        recruiter_id: authUser?.role !== "admin" ? authUser?.recruiter_id || "" : "",
        date_contacted: today,
        status: "new",
        rejection_date: "",
        start_date: "",
        paid: false,
        paid_date: "",
        payment_amount: 0,
        is_replacement: false,
        replacement_of_id: "",
        replacement_note: "",
      });
      await refreshPipeline();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Open edit modal and fetch payments for the selected application
  async function openEdit(row: PipelineRow) {
    setOpenEditApp(row);
    setPayForm({ paid_date: new Date().toISOString().slice(0, 10), amount: 0, note: "" });
    try {
      const list = await api.payments(row.id);
      setPayments(list);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  // ЛогинРоль changes to an application (status, dates, replacement info)
  async function saveEditApplication(row: PipelineRow) {
    setErr(null);
    if (row.status === "rejected" && !row.rejection_date) return setErr("Для rejected нужна дата отказа");
    if (row.status === "hired" && !row.start_date) return setErr("Для hired нужна дата выхода");
    setLoading(true);
    try {
      await api.updateApplication(row.id, {
        status: row.status,
        date_contacted: row.date_contacted,
        rejection_date: row.rejection_date,
        start_date: row.start_date,
        is_replacement: row.is_replacement,
        replacement_of_id: row.replacement_of_id,
        replacement_note: row.replacement_note,
      });
      setOpenEditApp(null);
      await refreshPipeline();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Delete an application after user confirmation
  async function deleteApplication(id: number) {
    if (!confirm("Удалить запись по кандидату?")) return;
    setLoading(true);
    try {
      await api.deleteApplication(id);
      await refreshPipeline();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Add a payment to the currently edited application
  async function addPaymentToCurrent() {
    if (!openEditApp) return;
    if (!payForm.paid_date) return setErr("Укажи дату платежа");
    if (!payForm.amount || payForm.amount <= 0) return setErr("Сумма платежа должна быть > 0");
    setLoading(true);
    try {
      await api.addPayment(openEditApp.id, {
        paid_date: payForm.paid_date,
        amount: payForm.amount,
        note: payForm.note || null,
      });
      const list = await api.payments(openEditApp.id);
      setPayments(list);
      await refreshPipeline();
      // Update openEditApp with fresh data from pipeline
      const fresh = (await api.pipeline({})).find((x) => x.id === openEditApp.id) || openEditApp;
      setOpenEditApp(fresh);
      setPayForm({ paid_date: new Date().toISOString().slice(0, 10), amount: 0, note: "" });
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Delete a payment
  async function deletePayment(paymentId: number) {
    if (!openEditApp) return;
    if (!confirm("Удалить платеж?")) return;
    setLoading(true);
    try {
      await api.deletePayment(paymentId);
      const list = await api.payments(openEditApp.id);
      setPayments(list);
      await refreshPipeline();
      const fresh = (await api.pipeline({})).find((x) => x.id === openEditApp.id) || openEditApp;
      setOpenEditApp(fresh);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // State for earnings reports
  const now = new Date();
  const [repYear, setRepYear] = useState(now.getFullYear());
  const [repMonth, setRepMonth] = useState(now.getMonth() + 1);
  const [repTotal, setRepTotal] = useState<number | null>(null);
  const [repItems, setRepItems] = useState<any[]>([]);

  // Load earnings report for selected year and month
  async function loadReport() {
    setErr(null);
    setLoading(true);
    try {
      const report = await api.earnings(repYear, repMonth);
      setRepTotal(report.total);
      setRepItems(report.items);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // Load report when switching to the reports tab
  useEffect(() => {
    if (tab === "Отчеты") loadReport();
  }, [tab]);

  // Load users when switching to the users tab
  useEffect(() => {
    if (tab === "Пользователи") refreshUsers();
  }, [tab]);

  // List of applications for selecting replacement application (in add/edit forms)
  const replacementOptions = useMemo(() => {
    return pipeline.slice(0, 500);
  }, [pipeline]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-sm text-slate-400">Загрузка...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Роль</div>
          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">Логин</div>
              <Input
                value={loginForm.username}
                onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Пароль</div>
              <Input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            {loginError ? <div className="text-xs text-rose-200">{loginError}</div> : null}
            <Button onClick={handleLogin} disabled={authBusy}>
              Логин
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Tab[] = authUser.role === "admin"
    ? ["Воронка", "Клиенты", "Вакансии", "Рекрутеры", "Отчеты", "Пользователи"]
    : ["Воронка", "Клиенты", "Вакансии", "Рекрутеры", "Отчеты"];
  const isAdmin = authUser.role === "admin";


  // UI Rendering
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          {/* Title */}
          <div>
            <div className="text-xl font-semibold">Recruiting CRM</div>
            <div className="text-xs text-slate-400">
              fee у вакансий, платежи (частичные), замены из списка, CSV
            </div>
          </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label="Toggle theme"
                className="theme-toggle"
              >
                {theme === "dark" ? "Dark" : "Light"}
              </Button>
              <Button variant="ghost" onClick={handleLogout}>
                Выйти
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-col md:flex-row md:items-center gap-2">
              <div className="text-xs text-slate-400">Пользователь: {authUser.username}</div>
            <div className="flex gap-2 flex-wrap items-center">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t as Tab)}
                  className={
                    "rounded-xl px-3 py-2 text-sm border transition " +
                    (tab === t
                      ? "bg-white/10 border-white/15 text-white"
                      : "bg-transparent border-white/10 text-slate-300 hover:bg-white/5")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      {/* Main content */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Error message */}
        {err ? (
          <div className="mb-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-rose-100 text-sm">
            {err}
          </div>
        ) : null}

        {/* Pipeline tab */}
        {tab === "Воронка" && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card title="Всего" value={stats.total} />
              <Card title="Hired" value={stats.hired} />
              <Card title="Оплачено (шт.)" value={stats.paidCount} />
              <Card title="Оплачено (сумма)" value={stats.paidSum} hint="сумма всех платежей по воронке" />
            </div>

            {/* Filters and actions */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
                {/* Filter inputs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Клиент</div>
                    <Select
                      value={filters.client_id ?? ""}
                      onChange={(e) => setFilters((f) => ({ ...f, client_id: e.target.value ? Number(e.target.value) : undefined }))}
                    >
                      <option value="">Все</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Рекрутер</div>
                    <Select
                      value={filters.recruiter_id ?? ""}
                      onChange={(e) => setFilters((f) => ({ ...f, recruiter_id: e.target.value ? Number(e.target.value) : undefined }))}
                      disabled={!isAdmin}
                    >
                      <option value="">Все</option>
                      {recruiters.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Статус</div>
                      <Select
                        value={filters.status ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value ? e.target.value : undefined }))}
                      >
                        <option value="">Все</option>
                        <option value="new">new</option>
                        <option value="in_process">in_process</option>
                        <option value="rejected">rejected</option>
                        <option value="hired">hired</option>
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Поиск</div>
                      <Input
                        placeholder="кандидат, вакансия, клиент, рекрутер"
                        value={filters.search ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
                      />
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => refreshPipeline()} disabled={loading}>
                      Обновить
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        downloadCSV(
                          "pipeline.csv",
                          pipeline.map((p) => ({
                            id: p.id,
                            candidate: p.candidate_name,
                            client: p.client_name,
                            vacancy: p.vacancy_title,
                            recruiter: p.recruiter_name,
                            date_contacted: p.date_contacted,
                            status: p.status,
                            rejection_date: p.rejection_date ?? "",
                            start_date: p.start_date ?? "",
                            paid: p.paid ? "yes" : "no",
                            last_paid_date: p.paid_date ?? "",
                            total_paid: p.payment_amount,
                            is_replacement: p.is_replacement ? "yes" : "no",
                            replacement_of_id: p.replacement_of_id ?? "",
                            replacement_note: p.replacement_note ?? "",
                          })
                        ));
                      }}
                    >
                      Экспорт CSV
                    </Button>
                    <Button onClick={() => setOpenAddApp(true)} disabled={loading}>
                      + Добавить
                    </Button>
                  </div>
                </div>
              </div>
              {/* Pipeline table */}
              <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/5 text-slate-300">
                    <tr>
                      <th className="text-left p-3">Кандидат</th>
                      <th className="text-left p-3">Клиент</th>
                      <th className="text-left p-3">Вакансия</th>
                      <th className="text-left p-3">Рекрутер</th>
                      <th className="text-left p-3">Дата общения</th>
                      <th className="text-left p-3">Статус</th>
                      <th className="text-left p-3">Оплата</th>
                      <th className="text-left p-3">Последн. дата</th>
                      <th className="text-left p-3">Сумма</th>
                      <th className="text-left p-3">Замена</th>
                      <th className="text-left p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.map((row) => (
                      <tr key={row.id} className="border-t border-white/10 hover:bg-white/5">
                        <td className="p-3 font-medium">{row.candidate_name}</td>
                        <td className="p-3">{row.client_name}</td>
                        <td className="p-3">
                          <div className="font-medium">{row.vacancy_title}</div>
                          <div className="text-xs text-slate-400">fee: {row.vacancy_fee}</div>
                        </td>
                        <td className="p-3">{row.recruiter_name}</td>
                        <td className="p-3">{row.date_contacted}</td>
                        <td className="p-3">
                          <span className={badge(row.status)}>{row.status}</span>
                        </td>
                        <td className="p-3">{row.paid ? "да" : "нет"}</td>
                        <td className="p-3">{row.paid_date ?? "-"}</td>
                        <td className="p-3">{row.payment_amount ?? 0}</td>
                        <td className="p-3">{row.is_replacement ? "да" : "нет"}</td>
                        <td className="p-3 flex gap-2 justify-end">
                          <Button variant="ghost" onClick={() => openEdit(row)}>Редакт.</Button>
                          <Button variant="danger" onClick={() => deleteApplication(row.id)}>Удалить</Button>
                        </td>
                      </tr>
                    ))}
                    {pipeline.length === 0 && (
                      <tr>
                        <td className="p-5 text-slate-400" colSpan={11}>
                          Пока пусто. Нажми “Добавить”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
           

            {/* Add application modal */}
            <Modal open={openAddApp} title="Добавить кандидата в воронку" onClose={() => setOpenAddApp(false)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-400 mb-1">ФИО кандидата</div>
                  <Input
                    value={addForm.full_name}
                    onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Телефон</div>
                  <Input value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Email</div>
                  <Input value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-400 mb-1">Заметки</div>
                  <Input value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Клиент</div>
                  <Select
                    value={addForm.client_id}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, client_id: e.target.value ? Number(e.target.value) : "", vacancy_id: "", payment_amount: 0 }))
                    }
                  >
                    <option value="">Выбрать</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Вакансия</div>
                  <Select
                    value={addForm.vacancy_id}
                    onChange={(e) => {
                      const vid = e.target.value ? Number(e.target.value) : "";
                      const vac = vacancies.find((v) => v.id === vid);
                      setAddForm((f) => ({
                        ...f,
                        vacancy_id: vid,
                        payment_amount: f.paid ? Number(vac?.fee_amount || 0) : f.payment_amount,
                      }));
                    }}
                  >
                    <option value="">Выбрать</option>
                    {filteredVacancies.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title} (fee {v.fee_amount})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Рекрутер</div>
                  <Select
                    value={addForm.recruiter_id}
                    onChange={(e) => setAddForm((f) => ({ ...f, recruiter_id: e.target.value ? Number(e.target.value) : "" }))}
                    disabled={!isAdmin}
                  >
                    <option value="">Выбрать</option>
                    {recruiters.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Дата общения</div>
                  <Input
                    type="date"
                    value={addForm.date_contacted}
                    onChange={(e) => setAddForm((f) => ({ ...f, date_contacted: e.target.value }))}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Статус</div>
                  <Select value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value as any }))}>
                    <option value="new">new</option>
                    <option value="in_process">in_process</option>
                    <option value="rejected">rejected</option>
                    <option value="hired">hired</option>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Дата отказа (если rejected)</div>
                  <Input type="date" value={addForm.rejection_date} onChange={(e) => setAddForm((f) => ({ ...f, rejection_date: e.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Дата выхода (если hired)</div>
                  <Input type="date" value={addForm.start_date} onChange={(e) => setAddForm((f) => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={addForm.paid}
                    onChange={(e) => {
                      const paid = e.target.checked;
                      setAddForm((f) => ({
                        ...f,
                        paid,
                        payment_amount: paid ? Number(selectedVacancy?.fee_amount || 0) : 0,
                      }));
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-200">Сразу добавить первый платеж</span>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Дата платежа</div>
                  <Input type="date" value={addForm.paid_date} onChange={(e) => setAddForm((f) => ({ ...f, paid_date: e.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Сумма платежа (авто из fee)</div>
                  <Input
                    type="number"
                    value={addForm.payment_amount}
                    onChange={(e) => setAddForm((f) => ({ ...f, payment_amount: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={addForm.is_replacement}
                    onChange={(e) => setAddForm((f) => ({ ...f, is_replacement: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-200">Это замена</span>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Замена кого (из списка)</div>
                  <Select
                    value={addForm.replacement_of_id}
                    onChange={(e) => setAddForm((f) => ({ ...f, replacement_of_id: e.target.value ? Number(e.target.value) : "" }))}
                    disabled={!addForm.is_replacement}
                  >
                    <option value="">Выбрать</option>
                    {replacementOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.id} | {r.candidate_name} | {r.client_name} | {r.vacancy_title}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-400 mb-1">Комментарий по замене</div>
                  <Input value={addForm.replacement_note} onChange={(e) => setAddForm((f) => ({ ...f, replacement_note: e.target.value }))} />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpenAddApp(false)}>
                  Отмена
                </Button>
                <Button onClick={submitAddApplication} disabled={loading}>
                  Сохранить
                </Button>
              </div>
            </Modal>

            {/* Edit application modal */}
            <Modal
              open={!!openEditApp}
              title={openEditApp ? `Редактировать: ${openEditApp.candidate_name}` : "Редактировать"}
              onClose={() => setOpenEditApp(null)}
            >
              {openEditApp && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Статус</div>
                    <Select value={openEditApp.status} onChange={(e) => setOpenEditApp({ ...openEditApp, status: e.target.value as any })}>
                      <option value="new">new</option>
                      <option value="in_process">in_process</option>
                      <option value="rejected">rejected</option>
                      <option value="hired">hired</option>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Дата общения</div>
                    <Input type="date" value={openEditApp.date_contacted} onChange={(e) => setOpenEditApp({ ...openEditApp, date_contacted: e.target.value })} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Дата отказа</div>
                    <Input type="date" value={openEditApp.rejection_date ?? ""} onChange={(e) => setOpenEditApp({ ...openEditApp, rejection_date: e.target.value || null })} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Дата выхода</div>
                    <Input type="date" value={openEditApp.start_date ?? ""} onChange={(e) => setOpenEditApp({ ...openEditApp, start_date: e.target.value || null })} />
                  </div>
                  {/* Payment editing section */}
                  <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">Платежи</div>
                        <div className="text-xs text-slate-400">
                          оплачено: {openEditApp.payment_amount} | последняя дата: {openEditApp.paid_date ?? "-"}
                        </div>
                      </div>
                    </div>
                    {/* Payment input row */}
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Дата</div>
                        <Input type="date" value={payForm.paid_date} onChange={(e) => setPayForm((f) => ({ ...f, paid_date: e.target.value }))} />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Сумма</div>
                        <Input type="number" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Комментарий</div>
                        <Input value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} />
                      </div>
                      <div className="md:col-span-3 flex justify-end">
                        <Button onClick={addPaymentToCurrent} disabled={loading}>+ Добавить платеж</Button>
                      </div>
                    </div>
                    {/* Payment list */}
                    <div className="mt-3 overflow-auto rounded-2xl border border-white/10">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white/5 text-slate-300">
                          <tr>
                            <th className="text-left p-2">Дата</th>
                            <th className="text-left p-2">Сумма</th>
                            <th className="text-left p-2">Комментарий</th>
                            <th className="text-left p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id} className="border-t border-white/10 hover:bg-white/5">
                              <td className="p-2">{p.paid_date}</td>
                              <td className="p-2 font-medium">{p.amount}</td>
                              <td className="p-2">{p.note ?? ""}</td>
                              <td className="p-2 text-right">
                                <Button variant="danger" onClick={() => deletePayment(p.id)} disabled={loading}>
                                  Удалить
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {payments.length === 0 && (
                            <tr>
                              <td className="p-3 text-slate-400" colSpan={4}>
                                Платежей пока нет.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={openEditApp.is_replacement}
                      onChange={(e) => setOpenEditApp({ ...openEditApp, is_replacement: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-slate-200">Это замена</span>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Замена кого</div>
                    <Select
                      value={openEditApp.replacement_of_id ?? ""}
                      onChange={(e) => setOpenEditApp({ ...openEditApp, replacement_of_id: e.target.value ? Number(e.target.value) : null })}
                      disabled={!openEditApp.is_replacement}
                    >
                      <option value="">Выбрать</option>
                      {replacementOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          #{r.id} | {r.candidate_name} | {r.client_name} | {r.vacancy_title}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-400 mb-1">Комментарий по замене</div>
                    <Input value={openEditApp.replacement_note ?? ""} onChange={(e) => setOpenEditApp({ ...openEditApp, replacement_note: e.target.value || null })} />
                  </div>
                  <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                    <Button variant="ghost" onClick={() => setOpenEditApp(null)}>
                      Отмена
                    </Button>
                    <Button onClick={() => saveEditApplication(openEditApp)} disabled={loading}>
                      Сохранить
                    </Button>
                  </div>
                </div>
              )}
            </Modal>

          </>
        )}

        {/* Edit client modal */}
        <Modal
          open={!!openEditClient}
          title="Редактировать клиента"
          onClose={() => setOpenEditClient(null)}
        >
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">Имя клиента</div>
              <Input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenEditClient(null)}>
                Отмена
              </Button>
              <Button onClick={saveEditClient} disabled={loading}>
                Сохранить
              </Button>
            </div>
          </div>
        </Modal>

        {/* Edit recruiter modal */}
        <Modal
          open={!!openEditRecruiter}
          title="Редактировать рекрутера"
          onClose={() => setOpenEditRecruiter(null)}
        >
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">Имя рекрутера</div>
              <Input value={editRecruiterName} onChange={(e) => setEditRecruiterName(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenEditRecruiter(null)}>
                Отмена
              </Button>
              <Button onClick={saveEditRecruiter} disabled={loading}>
                Сохранить
              </Button>
            </div>
          </div>
        </Modal>

        {/* Edit vacancy modal */}
        <Modal
          open={openSettings}
          title="Настройки"
          onClose={() => setOpenSettings(false)}
        >
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rememberUser}
                onChange={(e) => setRememberUser(e.target.checked)}
              />
              <span>Запомнить пользователя на этом устройстве</span>
            </label>
            <div className="text-xs text-slate-400">
              Если не запоминать, вход будет сбрасываться при закрытии окна.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenSettings(false)}>
                Закрыть
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  handleLogout();
                  setOpenSettings(false);
                }}
              >
                Сменить пользователя
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={!!openEditVacancy}
          title="Редактировать вакансию"
          onClose={() => setOpenEditVacancy(null)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">Клиент</div>
              <Select
                value={editVacancyClientId}
                onChange={(e) => setEditVacancyClientId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Выбрать</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Название вакансии</div>
              <Input value={editVacancyTitle} onChange={(e) => setEditVacancyTitle(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Город</div>
              <Input value={editVacancyCity} onChange={(e) => setEditVacancyCity(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Fee (ставка)</div>
              <Input type="number" value={editVacancyFee} onChange={(e) => setEditVacancyFee(Number(e.target.value))} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenEditVacancy(null)}>
                Пароль
              </Button>
              <Button onClick={saveEditVacancy} disabled={loading}>
                ЛогинРоль
              </Button>
            </div>
          </div>
        </Modal>

        {/* Edit user modal */}
        <Modal
          open={!!openEditUser}
          title="Редактировать пользователя"
          onClose={() => setOpenEditUser(null)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">Логин</div>
              <Input value={editUser.username} onChange={(e) => setEditUser((u) => ({ ...u, username: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Пароль (если нужно обновить)</div>
              <Input type="password" value={editUser.password} onChange={(e) => setEditUser((u) => ({ ...u, password: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Роль</div>
              <Select value={editUser.role} onChange={(e) => setEditUser((u) => ({ ...u, role: e.target.value as any }))}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Select>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Рекрутер</div>
              <Select
                value={editUser.recruiter_id}
                onChange={(e) => setEditUser((u) => ({ ...u, recruiter_id: e.target.value ? Number(e.target.value) : "" }))}
                disabled={editUser.role === "admin"}
              >
                <option value="">Выберите</option>
                {recruiters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenEditUser(null)}>
                Отмена
              </Button>
              <Button onClick={saveEditUser} disabled={loading}>
                Сохранить
              </Button>
            </div>
          </div>
        </Modal>

        {/* Clients tab */}
        {tab === "Клиенты" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            {isAdmin ? (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <div className="text-xs text-slate-400 mb-1">Добавить клиента</div>
                  <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="например: Acme Corp" />
                </div>
                <Button onClick={addClient} disabled={loading}>
                  Добавить
                </Button>
              </div>
            ) : (
              <div className="text-xs text-slate-400">Только администратор может добавлять клиентов.</div>
            )}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {clients.map((c) => (
                <div key={c.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 flex items-center justify-between">
                  <div className="font-medium">{c.name}</div>
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={() => openClientEdit(c)} disabled={loading}>
                        Редактировать
                      </Button>
                      <Button variant="danger" onClick={() => api.deleteClient(c.id).then(refreshAll)} disabled={loading}>
                        Удалить
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recruiters tab */}
        {tab === "Рекрутеры" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            {isAdmin ? (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <div className="text-xs text-slate-400 mb-1">Добавить рекрутера</div>
                  <Input value={newRecruiterName} onChange={(e) => setNewRecruiterName(e.target.value)} placeholder="например: Kim" />
                </div>
                <Button onClick={addRecruiter} disabled={loading}>
                  Добавить
                </Button>
              </div>
            ) : (
              <div className="text-xs text-slate-400">Только администратор может добавлять рекрутеров.</div>
            )}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {recruiters.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 flex items-center justify-between">
                  <div className="font-medium">{r.name}</div>
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={() => openRecruiterEdit(r)} disabled={loading}>
                        Редактировать
                      </Button>
                      <Button variant="danger" onClick={() => api.deleteRecruiter(r.id).then(refreshAll)} disabled={loading}>
                        Удалить
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users tab */}
        {tab === "Пользователи" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <div className="text-xs text-slate-400 mb-1">Логин</div>
                <Input value={newUser.username} onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))} />
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Пароль</div>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))} />
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Роль</div>
                <Select value={newUser.role} onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value as any }))}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </Select>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Рекрутер</div>
                <Select
                  value={newUser.recruiter_id}
                  onChange={(e) => setNewUser((u) => ({ ...u, recruiter_id: e.target.value ? Number(e.target.value) : "" }))}
                  disabled={newUser.role === "admin"}
                >
                  <option value="">Выберите</option>
                  {recruiters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-5 flex justify-end">
                <Button onClick={createUser} disabled={loading}>
                  Добавить пользователя
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="text-left p-3">Логин</th>
                    <th className="text-left p-3">Роль</th>
                    <th className="text-left p-3">Рекрутер</th>
                    <th className="text-left p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-3 font-medium">{u.username}</td>
                      <td className="p-3">{u.role}</td>
                      <td className="p-3">{recruiters.find((r) => r.id === u.recruiter_id)?.name ?? (u.recruiter_id ?? "-")}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" onClick={() => openUserEdit(u)} disabled={loading}>
                            Редактировать
                          </Button>
                          <Button variant="danger" onClick={() => deleteUser(u.id)} disabled={loading}>
                            Удалить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td className="p-5 text-slate-400" colSpan={4}>
                        Пользователей нет.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vacancies tab */}
        {tab === "Вакансии" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            {isAdmin ? (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Клиент</div>
                  <Select value={newVacancyClientId} onChange={(e) => setNewVacancyClientId(e.target.value ? Number(e.target.value) : "")}> 
                    <option value="">Выбрать</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-400 mb-1">Название вакансии</div>
                  <Input value={newVacancyTitle} onChange={(e) => setNewVacancyTitle(e.target.value)} placeholder="например: Senior Python Developer" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Город</div>
                  <Input value={newVacancyCity} onChange={(e) => setNewVacancyCity(e.target.value)} placeholder="например: Киев" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Fee (ставка)</div>
                  <Input type="number" value={newVacancyFee} onChange={(e) => setNewVacancyFee(Number(e.target.value))} />
                </div>
                <div className="md:col-span-5 flex justify-end">
                  <Button onClick={addVacancy} disabled={loading}>
                    Добавить вакансию
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">Только администратор может добавлять вакансии.</div>
            )}
            <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="text-left p-3">Клиент</th>
                    <th className="text-left p-3">Вакансия</th>
                    <th className="text-left p-3">Город</th>
                    <th className="text-left p-3">Fee (ставка)</th>
                    <th className="text-left p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vacanciesForClient.map((v) => (
                    <tr key={v.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-3">{clients.find((c) => c.id === v.client_id)?.name ?? v.client_id}</td>
                      <td className="p-3 font-medium">{v.title}</td>
                      <td className="p-3">{v.city || "-"}</td>
                      <td className="p-3">{v.fee_amount}</td>
                      <td className="p-3 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" onClick={() => openVacancyEdit(v)} disabled={loading}>
                              Редактировать
                            </Button>
                            <Button variant="danger" onClick={() => api.deleteVacancy(v.id).then(refreshAll)} disabled={loading}>
                              Удалить
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {vacanciesForClient.length === 0 && (
                    <tr>
                      <td className="p-5 text-slate-400" colSpan={5}>
                        Добавь первую вакансию.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reports tab */}
        {tab === "Отчеты" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Год</div>
                  <Input type="number" value={repYear} onChange={(e) => setRepYear(Number(e.target.value))} />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Месяц</div>
                  <Input type="number" value={repMonth} onChange={(e) => setRepMonth(Number(e.target.value))} />
                </div>
                <div className="flex items-end">
                  <Button onClick={loadReport} disabled={loading}>
                    Показать
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      downloadCSV(
                        `earnings_${repYear}-${String(repMonth).padStart(2, "0")}.csv`,
                        repItems.map((it) => ({
                          paid_date: it.paid_date,
                          amount: it.amount,
                          candidate: it.candidate_name,
                          client: it.client_name,
                          vacancy: it.vacancy_title,
                          recruiter: it.recruiter_name,
                          application_id: it.application_id,
                          payment_id: it.payment_id,
                        }))
                      );
                    }}
                  >
                    Экспорт CSV
                  </Button>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Итого за месяц</div>
                <div className="text-2xl font-semibold">{repTotal ?? "-"}</div>
              </div>
            </div>
            <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="text-left p-3">Дата оплаты</th>
                    <th className="text-left p-3">Сумма</th>
                    <th className="text-left p-3">Кандидат</th>
                    <th className="text-left p-3">Клиент</th>
                    <th className="text-left p-3">Вакансия</th>
                    <th className="text-left p-3">Рекрутер</th>
                  </tr>
                </thead>
                <tbody>
                  {repItems.map((it, idx) => (
                    <tr key={idx} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-3">{it.paid_date}</td>
                      <td className="p-3 font-medium">{it.amount}</td>
                      <td className="p-3">{it.candidate_name}</td>
                      <td className="p-3">{it.client_name}</td>
                      <td className="p-3">{it.vacancy_title}</td>
                      <td className="p-3">{it.recruiter_name}</td>
                    </tr>
                  ))}
                  {repItems.length === 0 && (
                    <tr>
                      <td className="p-5 text-slate-400" colSpan={6}>
                        За выбранный месяц платежей нет.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer tip */}
        <div className="mt-6 text-xs text-slate-500">
          {tip}
        </div>
      </div>
    </div>
  );
}








