from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from .routes.leads import bp as leads_bp
from .routes.zoning import bp as zoning_bp
from .routes.underwriting import bp as underwriting_bp
from .routes.deals import bp as deals_bp


def create_app() -> Flask:
    load_dotenv()
    app = Flask(__name__)
    CORS(app)

    app.register_blueprint(leads_bp, url_prefix="/api/leads")
    app.register_blueprint(zoning_bp, url_prefix="/api/zoning")
    app.register_blueprint(underwriting_bp, url_prefix="/api/underwrite")
    app.register_blueprint(deals_bp, url_prefix="/api/deals")

    @app.get("/api/health")
    def health():
        return {"ok": True}

    return app
