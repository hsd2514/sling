import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export const uploadProtein = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/upload", form);
};

export const analyzeProtein = (session_id, params = null) =>
  api.post("/analyze", params ? { session_id, params } : { session_id });

export const importPockets = (session_id, file) => {
  const form = new FormData();
  form.append("session_id", session_id);
  form.append("file", file);
  return api.post("/pockets/import", form);
};

export const suggestDrugs = (session_id, pocket_id = null) =>
  api.post("/drugs", pocket_id ? { session_id, pocket_id } : { session_id });

export const generateReport = (session_id) =>
  api.post("/report", { session_id }, { responseType: "blob" });

export const listSessions = () => api.get("/sessions");

export const getSession = (session_id) => api.get(`/sessions/${session_id}`);

export const downloadPocketPdb = (session_id, pocket_id) =>
  api.get(`/pockets/${session_id}/${pocket_id}/pdb`, { responseType: "blob" });

/* ── Knowledge Graph ── */
export const fetchKnowledgeGraph = (session_id) =>
  api.post("/knowledge-graph", { session_id });

/* ── Protein Comparison ── */
export const compareProteins = (session_id_a, session_id_b) =>
  api.post("/compare", { session_id_a, session_id_b });

/* ── Dataset Builder ── */
export const addToDataset = (session_id, notes = "", tags = []) =>
  api.post("/dataset/add", { session_id, notes, tags });

export const listDataset = () => api.get("/dataset");

export const updateDatasetEntry = (entry_id, notes, tags) =>
  api.put("/dataset/update", { entry_id, notes, tags });

export const removeFromDataset = (entry_id) =>
  api.delete(`/dataset/${entry_id}`);

export const exportDataset = (fmt = "csv") =>
  api.get(`/dataset/export/${fmt}`, { responseType: "blob" });
