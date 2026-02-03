/*
 * API helper module for the recruiting CRM frontend.
 *
 * This module defines TypeScript types for the data structures used by the
 * backend as well as helper functions to perform HTTP requests to the
 * FastAPI server. It centralizes the API base URL and response handling.
 */
// In production, use relative paths (same domain as frontend)
// In development, use localhost:15000
const API = window.location.hostname === 'localhost' ? "http://localhost:15000" : "";
// Generic HTTP helper that wraps fetch with default headers and error handling.
async function http(path, options) {
    const res = await fetch(`${API}${path}`, {
        headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
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
    deleteClient: (id) => http(`/clients/${id}`, { method: "DELETE" }),
    // Recruiters
    recruiters: () => http("/recruiters"),
    createRecruiter: (name) => http("/recruiters", { method: "POST", body: JSON.stringify({ name }) }),
    deleteRecruiter: (id) => http(`/recruiters/${id}`, { method: "DELETE" }),
    // Vacancies
    vacancies: (client_id) => http(client_id ? `/vacancies?client_id=${client_id}` : "/vacancies"),
    createVacancy: (payload) => http("/vacancies", { method: "POST", body: JSON.stringify(payload) }),
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
};
