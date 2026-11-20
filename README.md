# OPTISIM — Simulateur de Liaison Fibre Optique

Simulateur complet d'une liaison fibre optique point-à-point, avec :
- Bilan de puissance (dBm)
- Bilan de dispersion chromatique
- Courbe temporelle Gaussienne (élargissement d'impulsion — style OptiSystem)
- Schéma interactif de la liaison
- Verdict automatique : liaison fonctionnelle ou non

## Installation

```bash
pip install flask
python app.py
```

Ouvrir http://localhost:5000

## Architecture de la liaison simulée

```
[ÉMETTEUR] —C₁— [======= FIBRE + ÉPISSURES =======] —C₂— [RÉCEPTEUR]
```

- **Émetteur** : longueur d'onde λ, puissance P_tx, largeur spectrale Δλ
- **2 connecteurs** : C₁ (émetteur↔fibre) et C₂ (fibre↔récepteur)
- **Fibre** : Monomode G.652 / FSI G.653 / FGI G.655, longueur L, α, D
- **Épissures** : N épissures réparties uniformément, perte/épissure
- **Récepteur** : sensibilité S, puissance minimale P_min

## Critères de fonctionnement

| Bilan       | Critère                        |
|-------------|-------------------------------|
| Puissance   | P_rx ≥ S  ET  P_rx ≥ P_min  |
| Dispersion  | σ_D = D·L·Δλ < T_b/4         |

## Courbe temporelle

Affiche l'élargissement de l'impulsion Gaussienne sous l'effet de la dispersion
chromatique, de D=0 (impulsion initiale, bleu) jusqu'à D réel (vert), en passant
par 4 valeurs intermédiaires (gris). Inspirée de l'Optical Time Domain Visualizer
d'OptiSystem.
