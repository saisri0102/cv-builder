from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

from backend.routes.resume_routes import resume_bp
app.register_blueprint(resume_bp)

@app.route("/")
def home():
    return "TalentHireAI Backend is running!"

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=8080)
                         