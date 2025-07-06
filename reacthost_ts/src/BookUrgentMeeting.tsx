import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { registerLocale } from 'react-datepicker';
import { enGB } from 'date-fns/locale/en-GB';
registerLocale('en-GB', enGB);

function parseDateTime(val: string): Date | null {
  if (!val) return null;
  if (val.includes('T')) return new Date(val);
  // Try to parse dd/MM/yyyy hh:mm
  const match = val.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}`);
  }
  return null;
}

interface BookUrgentMeetingProps {
  onComplete: (data?: { city?: string; DateTime?: string; description?: string; participants?: string; result?: string }) => void;
  jsonParam?: string;
}

const BookUrgentMeeting: React.FC<BookUrgentMeetingProps> = ({ onComplete, jsonParam }) => {
  let parms = {};
  try {
    parms = jsonParam ? JSON.parse(jsonParam) : {};
  } catch {
    parms = {};
  }
  const [searchParams] = useSearchParams();
  const initialCity = (parms as any).city || '';
  const initialDateTimeRaw = (parms as any).DateTime || '';
  const [description, setDescription] = useState('');
  const [participants, setParticipants] = useState('');
  const [city, setCity] = useState(initialCity);
  const [dateTime, setDateTime] = useState<Date | null>(parseDateTime(initialDateTimeRaw));
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    let resultMsg = '';
    if (dateTime && city) {
      const dateStr = dateTime.toLocaleDateString('en-GB');
      const timeStr = dateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      resultMsg = `urgent meeting booked for ${city} on ${dateStr} at ${timeStr}`;
      setResult(resultMsg);
    }
    if (onComplete) onComplete({ city, DateTime: dateTime ? dateTime.toISOString() : '', description, participants, result: resultMsg });
  };

  const handleCancel = () => {
    setResult('user cancelled the booking request');
    if (onComplete) onComplete({ result: 'user cancelled the booking request' });
  };

  return (
    <div style={{ maxWidth: 500, margin: '2rem auto', padding: '2rem', border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>Book Urgent Zoom Meeting</h2>
      {submitted ? (
        <div style={{ color: 'green' }}>
          <strong>Meeting request submitted!</strong>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label>City:<br />
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                required
                style={{ width: '100%', padding: 8 }}
                placeholder="Enter city name"
              />
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Date and Time:<br />
              <DatePicker
                selected={dateTime}
                onChange={date => setDateTime(date as Date)}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                dateFormat="dd/MM/yyyy HH:mm"
                timeCaption="Time"
                locale="en-GB"
                placeholderText="dd/MM/yyyy hh:mm"
                className="form-control"
                required
              />
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Description:<br />
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                style={{ width: '100%', padding: 8 }}
                placeholder="Enter meeting description"
              />
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Participants (comma-separated emails):<br />
              <input
                type="text"
                value={participants}
                onChange={e => setParticipants(e.target.value)}
                required
                style={{ width: '100%', padding: 8 }}
                placeholder="e.g. alice@example.com, bob@example.com"
              />
            </label>
          </div>
          <button type="submit" style={{ padding: '8px 16px', marginRight: 8 }}>Book Meeting</button>
          <button type="button" style={{ padding: '8px 16px' }} onClick={handleCancel}>Cancel</button>
        </form>
      )}
      {result && (
        <div style={{ marginTop: 16, color: '#333' }}>
          <em>{result}</em>
        </div>
      )}
    </div>
  );
};

export default BookUrgentMeeting;
