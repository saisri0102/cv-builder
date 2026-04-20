import React, { useState } from 'react';
import { parseResumeText } from '../api/resumeApi'; // ✅ fixed

const ResumeParser = () => {
  const [resume, setResume] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resume.trim()) {
      setError('Please paste your resume text.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await parseResumeText(resume); // ✅ fixed
      setResult(data);
    } catch (err) {
      setError('Failed to parse resume. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Resume Parser</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          rows={10}
          cols={60}
          placeholder="Paste your resume here"
          value={resume}
          onChange={(e) => {
            setResume(e.target.value);
            setResult(null);
            setError(null);
          }}
          style={{ marginBottom: '10px' }}
        />
        <br />
        <button type="submit" disabled={loading}>
          {loading ? 'Parsing...' : 'Parse Resume'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: '20px' }}>
          <h4>Parsed Result:</h4>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default ResumeParser;
