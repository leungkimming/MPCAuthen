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
  onComplete: (data?: { city?: string; DateTime?: string; description?: string; participants?: string }) => void;
  city?: string;
  dateTime?: string;
}

const BookUrgentMeeting: React.FC<BookUrgentMeetingProps> = ({ onComplete, city: propCity, dateTime: propDateTime }) => {
  const [searchParams] = useSearchParams();
  const initialCity = propCity || searchParams.get('city') || '';
  const initialDateTimeRaw = propDateTime || searchParams.get('dateTime') || '';
  const [description, setDescription] = useState('');
  const [participants, setParticipants] = useState('');
  const [city, setCity] = useState(initialCity);
  const [dateTime, setDateTime] = useState<Date | null>(parseDateTime(initialDateTimeRaw));
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (onComplete) onComplete({ city, DateTime: dateTime ? dateTime.toISOString() : '', description, participants });
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
          <button type="button" style={{ padding: '8px 16px' }} onClick={() => onComplete && onComplete()}>Cancel</button>
        </form>
      )}
    </div>
  );
};

export default BookUrgentMeeting;
