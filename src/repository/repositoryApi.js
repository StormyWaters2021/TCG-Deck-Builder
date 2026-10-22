const ACCOUNT_ROOT=(import.meta.env.VITE_ACCOUNT_API || "http://localhost:8787").replace(/\/$/, "");
async function getRepositoryTicket(){
 const response=await fetch(`${ACCOUNT_ROOT}/api/auth/repository-ticket`,{method:"POST",credentials:"include",cache:"no-store",headers:{Accept:"application/json"}});
 if(!response.ok)throw new Error(response.status===401?"Sign in to submit decks":`Account verification failed (${response.status})`);
 const data=await response.json();if(typeof data.ticket!=="string")throw new Error("Invalid identity ticket");return data.ticket;
}
const ROOT = (import.meta.env.VITE_REPOSITORY_API || "").replace(/\/$/, "");
export async function repositoryRequest(path, params = {}) {
  if (!ROOT) throw new Error("Repository API is not configured. Set VITE_REPOSITORY_API.");
  const url = new URL(`${ROOT}/api/repository${path}`);
  Object.entries(params).forEach(([key, value]) => { if (value !== "" && value != null) url.searchParams.set(key, String(value)); });
  const ticket=path==="/permissions"?await getRepositoryTicket().catch(()=>null):null;
  const response = await fetch(url, { credentials: "include",headers:ticket?{Authorization:`Bearer ${ticket}`}:{},cache:"no-store" });
  if (!response.ok) throw new Error(`Repository service error (${response.status})`);
  return response.json();
}

export async function repositoryWrite(path, payload) {
  if (!ROOT) throw new Error("Repository API is not configured. Set VITE_REPOSITORY_API.");
  const ticket=await getRepositoryTicket();
  const response = await fetch(`${ROOT}/api/repository${path}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json",Authorization:`Bearer ${ticket}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Repository service error (${response.status})`);
  return data;
}
