"""WSGI entry point. Run with: gunicorn wsgi:app  (from the backend/ directory)."""
from app.app import app

if __name__ == "__main__":
    app.run(debug=True, port=5000)
