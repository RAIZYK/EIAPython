import os
from flask import Flask, jsonify, request, send_from_directory
import requests


try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


EIA_API_KEY = os.environ.get("EIA_API_KEY", "")

EIA_BASE_URL = "https://api.eia.gov/v2"

app = Flask(__name__, static_folder="static", static_url_path="")


def eia_get(path, params=None):


    if EIA_API_KEY == "":
        error_message = {"error": "Не задан EIA_API_KEY. Создайте .env с EIA_API_KEY=..."}
        return error_message, 500

    path = path.rstrip("/")
    full_url = EIA_BASE_URL + "/" + path

    if params is None:
        request_params = {}
    else:
        request_params = dict(params)
    request_params["api_key"] = EIA_API_KEY

    try:
        response = requests.get(full_url, params=request_params, timeout=30)
    except requests.RequestException as error:
        error_message = {"error": "Ошибка сети при обращении к EIA: " + str(error)}
        return error_message, 502

    if response.status_code != 200:
        error_message = {
            "error": "EIA вернул код " + str(response.status_code),
            "detail": response.text[:2000],
        }
        return error_message, response.status_code

    return response.json(), 200


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/routes")
@app.route("/api/routes/")
@app.route("/api/routes/<path:route>")
def api_routes(route=""):
    data, status_code = eia_get(route)
    return jsonify(data), status_code


@app.route("/api/facet/<path:route>/<facet_id>")
def api_facet(route, facet_id):
    facet_path = route + "/facet/" + facet_id
    data, status_code = eia_get(facet_path)
    return jsonify(data), status_code


@app.route("/api/data/<path:route>")
def api_data(route):
    params = {}

    frequency = request.args.get("frequency")
    if frequency:
        params["frequency"] = frequency

    start_year = request.args.get("start")
    end_year = request.args.get("end")
    if start_year:
        params["start"] = start_year
    if end_year:
        params["end"] = end_year

    data_columns = request.args.getlist("data")
    index = 0
    for column_name in data_columns:
        key = "data[" + str(index) + "]"
        params[key] = column_name
        index = index + 1

    for key in request.args.keys():
        if key.startswith("facets."):
            facet_name = key.split(".", 1)[1]
            raw_value = request.args.get(key, "")
            values_list = raw_value.split(",")

            value_index = 0
            for single_value in values_list:
                if single_value == "":
                    continue
                param_key = "facets[" + facet_name + "][" + str(value_index) + "]"
                params[param_key] = single_value
                value_index = value_index + 1

    params["sort[0][column]"] = "period"
    params["sort[0][direction]"] = "asc"

    params["offset"] = request.args.get("offset", "0")
    params["length"] = request.args.get("length", "5000")

    data_path = route + "/data/"
    data, status_code = eia_get(data_path, params)
    return jsonify(data), status_code


if __name__ == "__main__":
    app.run(debug=True, port=5000)