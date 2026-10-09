/** Server-only Google Calendar REST adapter. NOT used by the static GitHub Pages UI.
 * Wire from a secured API with tenant-scoped database, authenticated user,
 * encrypted OAuth token vault, retries, audit log, and durable transactional outbox.
 * Never expose OAuth refresh tokens to the client or commit secrets to Git.
 */
import { randomUUID } from 'node:crypto';

const BASE='https://www.googleapis.com/calendar/v3';
const ensure=v=>{if(!v)throw new Error('Required parameter missing');return v;};
async function callGoogle({accessToken,path,method='GET',body,headers={}}){
  ensure(accessToken);const res=await fetch(`${BASE}${path}`,{
    method,headers:{Authorization:`Bearer ${accessToken}`,...(body?{'Content-Type':'application/json'}:{}),...headers},
    body:body?JSON.stringify(body):undefined,cache:'no-store'
  });
  if(res.status===410){const err=new Error('SYNC_TOKEN_EXPIRED');err.code='SYNC_TOKEN_EXPIRED';throw err;}
  if(!res.ok){const err=new Error(`Google Calendar request failed (${res.status})`);err.status=res.status;err.retryable=[429,500,502,503,504].includes(res.status);throw err;}
  if(res.status===204)return null;
  return res.json();
}
const encode=encodeURIComponent;
export function toGoogleEvent({organizationId,projectId,customer,service,address,startIso,endIso,timeZone='America/New_York'}){
  if(!organizationId||!projectId||!customer||!startIso||!endIso)throw new Error('Incomplete appointment');
  if(!Number.isFinite(Date.parse(startIso))||!Number.isFinite(Date.parse(endIso))||Date.parse(endIso)<=Date.parse(startIso))throw new Error('Invalid appointment time range');
  return {summary:`GTF · ${customer} · ${service||'Job'}`,location:address||'',description:`Project ${projectId}. Managed by Georgia Top Floors Hub.`,start:{dateTime:startIso,timeZone},end:{dateTime:endIso,timeZone},extendedProperties:{private:{gtf_organization_id:String(organizationId),gtf_project_id:String(projectId)}}};
}
/** Use the stored google_event_id when present. Updating by title/name is unsafe. */
export async function upsertCalendarEvent({accessToken,calendarId='primary',eventId,etag,event}){
  ensure(event);const path=`/calendars/${encode(calendarId)}/events${eventId?'/'+encode(eventId):''}`;
  return callGoogle({accessToken,path,method:eventId?'PATCH':'POST',body:event,headers:etag?{'If-Match':etag}:{}});
}
/** Store nextSyncToken after consuming every result page; restart full sync on HTTP 410. */
export async function listChanges({accessToken,calendarId='primary',syncToken,pageToken}){
  const qp=new URLSearchParams({maxResults:'250',showDeleted:'true'});
  if(syncToken)qp.set('syncToken',syncToken);
  if(pageToken)qp.set('pageToken',pageToken);
  return callGoogle({accessToken,path:`/calendars/${encode(calendarId)}/events?${qp}`});
}
/** Store channel id/resource id/expiration; renew watch before expiration. HTTPS only. */
export async function watchChanges({accessToken,calendarId='primary',webhookUrl,secretChannelToken}){
  if(!webhookUrl?.startsWith('https://'))throw new Error('HTTPS webhook required');
  ensure(secretChannelToken);
  const id=randomUUID();const channel=await callGoogle({accessToken,path:`/calendars/${encode(calendarId)}/events/watch`,method:'POST',body:{id,type:'web_hook',address:webhookUrl,token:secretChannelToken}});
  return {id,channel};
}
/** The webhook carries change hints, not full event data: validate headers and enqueue a sync. */
export function validateCalendarNotification(headers,channelRecord){
  const get=k=>headers.get?headers.get(k):headers[k]||headers[k.toLowerCase()];
  return Boolean(channelRecord&&get('x-goog-channel-id')===channelRecord.channelId&&get('x-goog-resource-id')===channelRecord.resourceId&&get('x-goog-channel-token')===channelRecord.secretToken);
}
