from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    subject = db.Column(db.String(100), nullable=False)
    availability = db.Column(db.String(200), nullable=False)

@app.route('/register', methods=['POST'])
def register_user():
    data = request.get_json()
    new_user = User(name=data['name'], role=data['role'], subject=data['subject'], availability=','.join(data['availability']))
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'id': new_user.id})

@app.route('/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([{'id': u.id, 'name': u.name, 'role': u.role, 'subject': u.subject, 'availability': u.availability.split(',')} for u in users])

if __name__ == '__main__':
    app.run(debug=True)
