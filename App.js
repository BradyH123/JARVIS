import { useState } from 'react';
import axios from 'axios';

export default function PeerTutoringForm() {
  const [formData, setFormData] = useState({
    name: '',
    role: 'student',
    subject: '',
    availability: [],
  });

  const [submitted, setSubmitted] = useState(false);
  const [match, setMatch] = useState(null);
  const timeSlots = ['Mon PM', 'Tue PM', 'Wed PM', 'Thu PM', 'Fri PM'];

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCheckbox = (e) => {
    const value = e.target.value;
    const updated = formData.availability.includes(value)
      ? formData.availability.filter((v) => v !== value)
      : [...formData.availability, value];
    setFormData({ ...formData, availability: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/register', formData);
      setSubmitted(true);
      const matchRes = await axios.post('http://localhost:5000/match', {
        id: res.data.id,
      });
      if (matchRes.data.match_found) {
        setMatch(matchRes.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow">
      <h1 className="text-2xl font-bold mb-4">Peer Tutoring Sign-Up</h1>
      {submitted && match ? (
        <div className="p-4 bg-green-100 rounded">
          <p>✅ Match found with <strong>{match.match_name}</strong></p>
          <p>🕒 Common time: {match.shared_time.join(', ')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            type="text"
            placeholder="Your Name"
            onChange={handleChange}
            className="w-full p-2 border rounded"
            required
          />
          <select name="role" onChange={handleChange} className="w-full p-2 border rounded">
            <option value="student">I need help</option>
            <option value="tutor">I can tutor</option>
          </select>
          <input
            name="subject"
            type="text"
            placeholder="Subject (e.g. Algebra, Biology)"
            onChange={handleChange}
            className="w-full p-2 border rounded"
            required
          />
          <fieldset className="border p-2 rounded">
            <legend className="font-semibold">When are you free?</legend>
            {timeSlots.map((slot) => (
              <label key={slot} className="block">
                <input
                  type="checkbox"
                  value={slot}
                  onChange={handleCheckbox}
                  className="mr-2"
                />
                {slot}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="bg-blue-500 text-white p-2 rounded w-full">
            Submit & Find Match
          </button>
        </form>
      )}
    </div>
  );
}
