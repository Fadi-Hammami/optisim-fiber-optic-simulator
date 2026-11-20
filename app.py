"""
╔══════════════════════════════════════════════════════════════╗
║       SIMULATEUR DE LIAISON OPTIQUE — BACKEND FLASK         ║
╚══════════════════════════════════════════════════════════════╝
"""

from flask import Flask, request, jsonify, render_template
import math

app = Flask(__name__)


# ══════════════════════════════════════════════════════════════
#  CALCULS : BILAN DE PUISSANCE
# ══════════════════════════════════════════════════════════════

def calculer_bilan_puissance(P_tx, alpha, L, nb_ep, perte_ep, perte_conn):
    nb_connecteurs    = 2
    perte_fibre       = alpha * L
    perte_epissures   = nb_ep * perte_ep
    perte_connecteurs = nb_connecteurs * perte_conn
    perte_totale      = perte_fibre + perte_epissures + perte_connecteurs
    P_rx              = P_tx - perte_totale
    return {
        "perte_fibre"      : round(perte_fibre, 4),
        "perte_epissures"  : round(perte_epissures, 4),
        "perte_connecteurs": round(perte_connecteurs, 4),
        "perte_totale"     : round(perte_totale, 4),
        "P_rx"             : round(P_rx, 4),
    }


# ══════════════════════════════════════════════════════════════
#  CALCULS : BILAN DE DISPERSION
# ══════════════════════════════════════════════════════════════

def calculer_bilan_dispersion(D, L, delta_lambda, type_fibre, n_fibre, delta_relative, type_codage):
    """
    Dispersion chromatique : D·L·Δλ  (ps → ns)
    Dispersion intermodale :
        FSI : Δτim = (n / c) × Δ × L          (en secondes → ns)
        FGI : Δτim = (n / 8c) × Δ² × L        (en secondes → ns)
        Monomode : 0
    Dispersion totale : sqrt(Δτim² + σchrom²)   (ns)
    Bande passante    : k / dispersion_totale    (GHz)  k=0.7(NRZ) ou 0.5(RZ)
    """
    c_km_s = 3e5  # vitesse de la lumière (km/s)

    # Dispersion chromatique
    sigma_chrom_ps = abs(D) * L * delta_lambda
    sigma_chrom_ns = sigma_chrom_ps / 1000.0

    # Dispersion intermodale
    if 'FSI' in type_fibre:
        delta_tau_im_ns = (n_fibre / c_km_s) * delta_relative * L * 1e9
    elif 'FGI' in type_fibre:
        delta_tau_im_ns = (n_fibre / (8.0 * c_km_s)) * (delta_relative ** 2) * L * 1e9
    else:
        delta_tau_im_ns = 0.0

    # Dispersion totale
    dispersion_totale_ns = math.sqrt(delta_tau_im_ns ** 2 + sigma_chrom_ns ** 2)

    # Bande passante
    coding_val = 0.7 if type_codage == 'NRZ' else 0.5
    if dispersion_totale_ns > 0:
        bande_passante_ghz = round(coding_val / dispersion_totale_ns, 4)
    else:
        bande_passante_ghz = None

    return {
        "sigma_chrom_ps"      : round(sigma_chrom_ps, 4),
        "sigma_chrom_ns"      : round(sigma_chrom_ns, 6),
        "delta_tau_im_ns"     : round(delta_tau_im_ns, 6),
        "dispersion_totale_ns": round(dispersion_totale_ns, 6),
        "coding_val"          : coding_val,
        "bande_passante_ghz"  : bande_passante_ghz,
        "type_codage"         : type_codage,
    }


# ══════════════════════════════════════════════════════════════
#  GÉNÉRATION COURBE TEMPORELLE GAUSSIENNE
# ══════════════════════════════════════════════════════════════

def generer_courbe_temporelle(P_tx_dBm, D, L, delta_lambda, debit_gbps):
    T_bit_ns  = 1.0 / debit_gbps
    sigma0_ns = T_bit_ns / 4.0
    P0_mW = 10.0 ** (P_tx_dBm / 10.0)
    P0_uW = P0_mW * 1000.0
    sigma_D_max_ps = abs(D) * L * delta_lambda
    sigma_D_max_ns = sigma_D_max_ps / 1000.0
    sigma_out_max  = math.sqrt(sigma0_ns**2 + sigma_D_max_ns**2)
    t_center = T_bit_ns
    t_span   = max(3.0 * T_bit_ns, 8.0 * sigma_out_max)
    N        = 600
    t_ns     = [t_center - t_span / 2.0 + i * t_span / N for i in range(N + 1)]
    n_steps  = 5
    D_values = [D * k / n_steps for k in range(n_steps + 1)] if abs(D) > 1e-9 else [0.0]
    curves = []
    for idx, d_val in enumerate(D_values):
        sigma_d_ns = abs(d_val) * L * delta_lambda / 1000.0
        sigma_ns   = math.sqrt(sigma0_ns**2 + sigma_d_ns**2)
        peak_uW    = P0_uW * sigma0_ns / sigma_ns
        pts_y = [
            peak_uW * math.exp(-0.5 * ((ti - t_center) / sigma_ns) ** 2)
            for ti in t_ns
        ]
        curves.append({
            "D_val"      : round(d_val, 2),
            "label"      : f"D={round(d_val)}ps/nm.km",
            "sigma_ns"   : round(sigma_ns, 6),
            "peak_uW"    : round(peak_uW, 6),
            "points_y"   : [round(y, 6) for y in pts_y],
            "is_original": idx == 0,
        })
    return {
        "t_ns"        : [round(ti, 6) for ti in t_ns],
        "curves"      : curves,
        "sigma0_ns"   : round(sigma0_ns, 6),
        "sigma_out_ns": round(sigma_out_max, 6),
        "sigma_D_ps"  : round(sigma_D_max_ps, 4),
        "T_bit_ns"    : round(T_bit_ns, 6),
        "P0_uW"       : round(P0_uW, 4),
    }


# ══════════════════════════════════════════════════════════════
#  GÉNÉRATION DONNÉES POUR SCHÉMA
# ══════════════════════════════════════════════════════════════

def generer_schema_puissance(P_tx, alpha, L, nb_ep, perte_ep, perte_conn):
    distances  = [0.0]
    puissances = [round(P_tx, 4)]
    events     = []
    d = 0.0
    p = P_tx
    p -= perte_conn
    d += 0.001 * L
    distances.append(round(d, 4))
    puissances.append(round(p, 4))
    events.append({"label": "C1", "x": round(d, 4), "y": round(p, 4), "type": "connector"})
    seg_len = L / (nb_ep + 1)
    for i in range(nb_ep + 1):
        d_end = d + seg_len
        p_end = p - alpha * seg_len
        distances.append(round(d_end, 4))
        puissances.append(round(p_end, 4))
        d, p = d_end, p_end
        if i < nb_ep:
            p -= perte_ep
            distances.append(round(d, 4))
            puissances.append(round(p, 4))
            events.append({"label": f"É{i+1}", "x": round(d, 4), "y": round(p, 4), "type": "splice"})
    p -= perte_conn
    distances.append(round(d, 4))
    puissances.append(round(p, 4))
    events.append({"label": "C2", "x": round(d, 4), "y": round(p, 4), "type": "connector"})
    return distances, puissances, events


# ══════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/simulate", methods=["POST"])
def simulate():
    data = request.get_json()
    try:
        lambda_nm      = float(data["lambda_nm"])
        P_tx           = float(data["P_tx"])
        delta_lambda   = float(data["delta_lambda"])
        type_fibre     = str(data["type_fibre"])
        L              = float(data["L"])
        nb_ep          = int(data["nb_ep"])
        alpha          = float(data["alpha"])
        D              = float(data["D"])
        perte_ep       = float(data["perte_ep"])
        perte_conn     = float(data["perte_conn"])
        sensibilite    = float(data["sensibilite"])
        P_min          = float(data["P_min"])
        debit          = float(data["debit"])
        type_codage    = str(data.get("type_codage", "NRZ"))
        n_fibre        = float(data.get("n_fibre", 1.46))
        delta_relative = float(data.get("delta_relative", 0.01))
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"error": f"Paramètre invalide : {e}"}), 400

    if L <= 0:
        return jsonify({"error": "La longueur L doit être > 0 km"}), 400
    if debit <= 0:
        return jsonify({"error": "Le débit doit être > 0 Gbps"}), 400
    if nb_ep < 0:
        return jsonify({"error": "Le nombre d'épissures ne peut pas être négatif"}), 400
    if delta_lambda <= 0:
        return jsonify({"error": "Δλ doit être > 0 nm"}), 400
    if alpha < 0:
        return jsonify({"error": "L'atténuation α doit être ≥ 0 dB/km"}), 400
    if sensibilite >= P_tx:
        return jsonify({"error": "La sensibilité doit être inférieure à la puissance émise"}), 400
    if type_codage not in ('NRZ', 'RZ'):
        type_codage = 'NRZ'

    bilan = calculer_bilan_puissance(P_tx, alpha, L, nb_ep, perte_ep, perte_conn)
    disp  = calculer_bilan_dispersion(D, L, delta_lambda, type_fibre, n_fibre, delta_relative, type_codage)
    temp  = generer_courbe_temporelle(P_tx, D, L, delta_lambda, debit)

    P_rx         = bilan["P_rx"]
    marge        = round(P_rx - sensibilite, 4)
    # Fonctionnalité déterminée UNIQUEMENT par le bilan de puissance
    puissance_ok = (marge >= 0) and (P_rx >= P_min)
    liaison_ok   = puissance_ok

    distances, puissances, events = generer_schema_puissance(
        P_tx, alpha, L, nb_ep, perte_ep, perte_conn
    )

    return jsonify({
        "bilan"         : bilan,
        "dispersion"    : disp,
        "temporal"      : temp,
        "marge"         : marge,
        "puissance_ok"  : puissance_ok,
        "liaison_ok"    : liaison_ok,
        "P_rx"          : P_rx,
        "sensibilite"   : sensibilite,
        "P_min"         : P_min,
        "P_tx"          : P_tx,
        "L"             : L,
        "nb_ep"         : nb_ep,
        "type_fibre"    : type_fibre,
        "lambda_nm"     : lambda_nm,
        "debit"         : debit,
        "delta_lambda"  : delta_lambda,
        "D"             : D,
        "type_codage"   : type_codage,
        "n_fibre"       : n_fibre,
        "delta_relative": delta_relative,
        "curve"         : {"distances": distances, "powers": puissances, "events": events},
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
