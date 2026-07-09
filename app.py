"""

Запуск:
    1) pip install -r requirements.txt
    2) получить бесплатный ключ: https://www.eia.gov/opendata/register.php
    3) создать файл .env рядом с app.py:
           EIA_API_KEY=ваш_ключ
    4) python app.py
    5) открыть http://127.0.0.1:5000
"""

import os
from flask import Flask, jsonify, request, send_from_directory
import requests


try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

EIA_API_KEY = os.environ.get("EIA_API_KEY", "")
EIA_BASE = "https://api.eia.gov/v2"

app = Flask(__name__, static_folder="static", static_url_path="")


def eia_get(path: str, params: dict | None = None):
    """Единая точка обращения к EIA API. path без ведущего/конечного слэша."""
    if not EIA_API_KEY:
        return {"error": "Не задан EIA_API_KEY. Создайте .env с EIA_API_KEY=..."}, 500

    url = f"{EIA_BASE}/{path}".rstrip("/")
    query = dict(params or {})
    query["api_key"] = EIA_API_KEY

    try:
        r = requests.get(url, params=query, timeout=30)
    except requests.RequestException as exc:
        return {"error": f"Ошибка сети при обращении к EIA: {exc}"}, 502

    if r.status_code != 200:
        return {"error": f"EIA вернул {r.status_code}", "detail": r.text[:2000]}, r.status_code

    return r.json(), 200


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/routes")
@app.route("/api/routes/")
@app.route("/api/routes/<path:route>")
def api_routes(route=""):
    data, status = eia_get(route)
    return jsonify(data), status


@app.route("/api/facet/<path:route>/<facet_id>")
def api_facet(route, facet_id):
    data, status = eia_get(f"{route}/facet/{facet_id}")
    return jsonify(data), status


@app.route("/api/data/<path:route>")
def api_data(route):
    params = {}

    frequency = request.args.get("frequency")
    if frequency:
        params["frequency"] = frequency

    start = request.args.get("start")
    end = request.args.get("end")
    if start:
        params["start"] = start
    if end:
        params["end"] = end

    for i, col in enumerate(request.args.getlist("data")):
        params[f"data[{i}]"] = col

    for key in request.args.keys():
        if key.startswith("facets."):

            facet_name = key.split(".", 1)[1]
            values = request.args.get(key, "").split(",")
            for i, v in enumerate(v for v in values if v):
                params[f"facets[{facet_name}][{i}]"] = v

    params["sort[0][column]"] = "period"
    params["sort[0][direction]"] = "asc"
    params["offset"] = request.args.get("offset", "0")
    params["length"] = request.args.get("length", "5000")

    data, status = eia_get(f"{route}/data/", params)
    return jsonify(data), status


if __name__ == "__main__":
    app.run(debug=True, port=5000)