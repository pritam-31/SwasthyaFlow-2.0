/**
 * Printable "appointment letter" builder.
 *
 * A patient (or staff member) can open the browser print dialog to print the
 * slip or save it as a PDF, then carry it to the clinic. The letter contains
 * only the booking details already shown in the app — it is a scheduling
 * document, never a diagnosis.
 */

import { CONSULTATION_TYPE_LABEL, type Appointment } from '../types/appointment.types'
import { formatHumanDate, formatHumanTime } from './appointmentDate'

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c)

function row(label: string, value: string): string {
  return `<tr><th>${esc(label)}</th><td>${esc(value).replace(/\n/g, '<br/>')}</td></tr>`
}

export function buildAppointmentLetterHtml(a: Appointment, facilityLabel: string): string {
  const letterNo = a.bookingReference
  const body = [
    `<header class="head">`,
    `<div><p class="brand">आरोग्य Sathi</p><p class="clinic">${esc(facilityLabel)}</p></div>`,
    `<div class="ref"><p class="ref-label">Booking reference</p><p class="ref-value">${esc(letterNo)}</p></div>`,
    `</header>`,
    `<h1>Appointment Confirmation Letter</h1>`,
    `<p class="meta">Issued ${esc(new Date().toLocaleString('en-IN'))} · Status: <strong>${esc(a.status)}</strong></p>`,
    `<table>`,
    row('Patient name', a.patientName),
    row('Department', a.departmentName),
    row('Doctor', a.doctorName),
    row('Appointment date', formatHumanDate(a.appointmentDate)),
    row('Time', `${formatHumanTime(a.startTime)} – ${formatHumanTime(a.endTime)}`),
    row('Duration', `${a.durationMinutes} minutes`),
    row('Visit type', CONSULTATION_TYPE_LABEL[a.consultationType]),
    row('Reason for visit', a.visitReason),
    row('Booked by', `${a.createdBy} (${a.createdByRole})`),
    `</table>`,
    `<p class="note"><strong>Please carry this letter</strong> (printed or on your phone) to the clinic on the day of your visit and report at the reception desk about 10 minutes before your appointment time.</p>`,
    `<p class="disclaimer">This is an appointment scheduling document, not a medical record or diagnosis. Arrive on time; if you cannot attend, cancel or request a change from the app so the slot is released for another patient.</p>`,
  ].join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Appointment ${esc(letterNo)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,Arial,sans-serif;color:#141c2b;margin:36px;line-height:1.5}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #141c2b;padding-bottom:12px;margin-bottom:18px}
  .brand{font-size:16px;font-weight:800;color:#0f766e;margin:0;letter-spacing:.02em}
  .clinic{font-size:12px;color:#64748a;margin:2px 0 0}
  .ref{text-align:right}
  .ref-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748a;margin:0}
  .ref-value{font-family:'Courier New',monospace;font-size:18px;font-weight:700;margin:2px 0 0}
  h1{font-size:20px;margin:0 0 4px}
  .meta{font-size:11px;color:#64748a;margin:0 0 18px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #e1e7ee;padding:9px 11px;vertical-align:top;text-align:left}
  th{width:34%;background:#f7f9fb;font-weight:700}
  .note{margin-top:18px;font-size:12px;border:1px solid #99f6e4;background:#f0fdfa;padding:11px 13px;border-radius:6px}
  .disclaimer{margin-top:14px;font-size:10px;color:#b45309;border:1px solid #fcd34d;background:#fffbeb;padding:10px;border-radius:6px}
  @media print{body{margin:18mm}}
</style></head><body>${body}</body></html>`
}

/** Opens a new window with the letter and triggers the print dialog. */
export function openPrintWindow(html: string): boolean {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  win.setTimeout(() => win.print(), 350)
  return true
}
