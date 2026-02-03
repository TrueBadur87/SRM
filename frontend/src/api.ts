/*
 * API helper module for the recruiting CRM frontend.
 *
 * This module defines TypeScript types for the data structures used by the
 * backend as well as helper functions to perform HTTP requests to the
 * FastAPI server. It centralizes the API base URL and response handling.
 */

// In production (when built), use relative paths (same domain as frontend)
// In development, use localhost:15000
const API = import.meta.env.PROD ? "" : "http://localhost:15000";

// Generic HTTP helper that wraps fetch with default headers and error handling.
async function http<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Data types for clients
export type Client = { id: number; name: string };

// Data types for recruiters
export type Recruiter = { id: number; name: string };

// Data types for vacancies
export type Vacancy = {
  id: number;
  client_id: number;
  title: string;
  fee_amount: number;
};

// Representation of a pipeline row returned from the backend. This is a
// flattened record of an application with related candidate, client,
// vacancy and recruiter fields.
export type PipelineRow = {
  id: number;

  date_contacted: string;
  status: "new" | "in_process" | "rejected" | "hired";
  rejection_date: string | null;
  start_date: string | null;

  paid: boolean;
  paid_date: string | null; // last payment date
  payment_amount: number;   // total of all payments

  is_replacement: boolean;
  replacement_of_id: number | null;
  replacement_note: string | null;

  candidate_id: number;
  candidate_name: string;

  recruiter_id: number;
  recruiter_name: string;

  vacancy_id: number;
  vacancy_title: string;
  vacancy_fee: number;

  client_id: number;
  client_name: string;
};

// Payload for creating a candidate
export type CandidateCreate = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

// Payload for creating an application. It supports an initial payment.
export type ApplicationCreate = {
  candidate_id: number;
  vacancy_id: number;
  recruiter_id: number;
  date_contacted: string;
  status: "new" | "in_process" | "rejected" | "hired";
  rejection_date?: string | null;
  start_date?: string | null;

  // optional initial payment fields
  paid?: boolean;
  paid_date?: string | null;
  payment_amount?: number;

  is_replacement?: boolean;
  replacement_of_id?: number | null;
  replacement_note?: string | null;
};

// Payload for updating an application
export type ApplicationUpdate = {
  date_contacted?: string;
  status?: "new" | "in_process" | "rejected" | "hired";
  rejection_date?: string | null;
  start_date?: string | null;
  is_replacement?: boolean;
  replacement_of_id?: number | null;
  replacement_note?: string | null;
};

// Payment type returned from the backend
export type Payment = {
  id: number;
  application_id: number;
  paid_date: string;
  amount: number;
  note: string | null;
  created_at: string;
};

// Payload for creating a payment
export type PaymentCreate = {
  paid_date: string;
  amount: number;
  note?: string | null;
};

// Earnings report item type
export type EarningsItem = {
  payment_id: number;
  paid_date: string;
  amount: number;
  candidate_name: string;
  client_name: string;
  vacancy_title: string;
  recruiter_name: string;
  application_id: number;
};

// Earnings report type
export type EarningsReport = {
  year: number;
  month: number;
  total: number;
  items: EarningsItem[];
};

// API wrapper functions
export const api = {
  // Clients
  clients: () => http<Client[]>("/clients"),
  createClient: (name: string) => http<Client>("/clients", { method: "POST", body: JSON.stringify({ name }) }),
  deleteClient: (id: number) => http<{ deleted: true }>(`/clients/${id}`, { method: "DELETE" }),

  // Recruiters
  recruiters: () => http<Recruiter[]>("/recruiters"),
  createRecruiter: (name: string) => http<Recruiter>("/recruiters", { method: "POST", body: JSON.stringify({ name }) }),
  deleteRecruiter: (id: number) => http<{ deleted: true }>(`/recruiters/${id}`, { method: "DELETE" }),

  // Vacancies
  vacancies: (client_id?: number) => http<Vacancy[]>(client_id ? `/vacancies?client_id=${client_id}` : "/vacancies"),
  createVacancy: (payload: { client_id: number; title: string; fee_amount: number }) =>
    http<Vacancy>("/vacancies", { method: "POST", body: JSON.stringify(payload) }),
  deleteVacancy: (id: number) => http<{ deleted: true }>(`/vacancies/${id}`, { method: "DELETE" }),

  // Candidates
  createCandidate: (payload: CandidateCreate) =>
    http<{ id: number; full_name: string }>("/candidates", { method: "POST", body: JSON.stringify(payload) }),

  // Pipeline
  pipeline: (params: { client_id?: number; recruiter_id?: number; status?: string; search?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.client_id) sp.set("client_id", String(params.client_id));
    if (params.recruiter_id) sp.set("recruiter_id", String(params.recruiter_id));
    if (params.status) sp.set("status", params.status);
    if (params.search) sp.set("search", params.search);
    const qs = sp.toString();
    return http<PipelineRow[]>(qs ? `/pipeline?${qs}` : "/pipeline");
  },

  // Applications
  createApplication: (payload: ApplicationCreate) =>
    http(`/applications`, { method: "POST", body: JSON.stringify(payload) }),
  updateApplication: (id: number, payload: ApplicationUpdate) =>
    http(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteApplication: (id: number) => http(`/applications/${id}`, { method: "DELETE" }),

  // Payments
  payments: (appId: number) => http<Payment[]>(`/applications/${appId}/payments`),
  addPayment: (appId: number, payload: PaymentCreate) =>
    http<Payment>(`/applications/${appId}/payments`, { method: "POST", body: JSON.stringify(payload) }),
  deletePayment: (paymentId: number) => http<{ deleted: true }>(`/payments/${paymentId}`, { method: "DELETE" }),

  // Earnings report
  earnings: (year: number, month: number) => http<EarningsReport>(`/reports/earnings?year=${year}&month=${month}`),
};