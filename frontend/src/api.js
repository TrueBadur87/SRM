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
const TOKEN_KEY = "crm.token";
function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
// Generic HTTP helper that wraps fetch with default headers and error handling.
async function http(path, options) {
    const token = getToken();
    const res = await fetch(`${API}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options?.headers || {})
        },
        ...options,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
}
// API wrapper functions
export const api = {
    // Clients
    clients: () => http("/clients"),
    createClient: (name) => http("/clients", { method: "POST", body: JSON.stringify({ name }) }),
    updateClient: (id, name) => http(`/clients/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    deleteClient: (id) => http(`/clients/${id}`, { method: "DELETE" }),
    // Recruiters
    recruiters: () => http("/recruiters"),
    createRecruiter: (name) => http("/recruiters", { method: "POST", body: JSON.stringify({ name }) }),
    updateRecruiter: (id, name) => http(`/recruiters/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    deleteRecruiter: (id) => http(`/recruiters/${id}`, { method: "DELETE" }),
    // Vacancies
    vacancies: (client_id) => http(client_id ? `/vacancies?client_id=${client_id}` : "/vacancies"),
    createVacancy: (payload) => http("/vacancies", { method: "POST", body: JSON.stringify(payload) }),
    updateVacancy: (id, payload) => http(`/vacancies/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteVacancy: (id) => http(`/vacancies/${id}`, { method: "DELETE" }),
    // Candidates
    createCandidate: (payload) => http("/candidates", { method: "POST", body: JSON.stringify(payload) }),
    // Pipeline
    pipeline: (params = {}) => {
        const sp = new URLSearchParams();
        if (params.client_id)
            sp.set("client_id", String(params.client_id));
        if (params.recruiter_id)
            sp.set("recruiter_id", String(params.recruiter_id));
        if (params.status)
            sp.set("status", params.status);
        if (params.search)
            sp.set("search", params.search);
        const qs = sp.toString();
        return http(qs ? `/pipeline?${qs}` : "/pipeline");
    },
    // Applications
    createApplication: (payload) => http(`/applications`, { method: "POST", body: JSON.stringify(payload) }),
    updateApplication: (id, payload) => http(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteApplication: (id) => http(`/applications/${id}`, { method: "DELETE" }),
    // Payments
    payments: (appId) => http(`/applications/${appId}/payments`),
    addPayment: (appId, payload) => http(`/applications/${appId}/payments`, { method: "POST", body: JSON.stringify(payload) }),
    deletePayment: (paymentId) => http(`/payments/${paymentId}`, { method: "DELETE" }),
    // Earnings report
    earnings: (year, month) => http(`/reports/earnings?year=${year}&month=${month}`),
    // Auth
    login: (username, password) => http("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    me: () => http("/auth/me"),
    // Users (admin)
    users: () => http("/users"),
    createUser: (payload) => http("/users", { method: "POST", body: JSON.stringify(payload) }),
    updateUser: (id, payload) => http(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteUser: (id) => http(`/users/${id}`, { method: "DELETE" }),
};
