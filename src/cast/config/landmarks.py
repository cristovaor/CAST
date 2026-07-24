FACEMESH_REGIONS = {
    "sobrancelha_direita": [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
    "sobrancelha_esquerda": [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],

    "olho_direito": [
        33, 7, 163, 144, 145, 153, 154, 155,
        133, 246, 161, 160, 159, 158, 157, 173,
    ],

    "olho_esquerdo": [
        263, 249, 390, 373, 374, 380, 381, 382,
        362, 466, 388, 387, 386, 385, 384, 398,
    ],

    "iris_direita": [469, 470, 471, 472],
    "iris_esquerda": [474, 475, 476, 477],

    "labios": [
        61, 146, 91, 181, 84, 17, 314, 405,
        321, 375, 291, 185, 40, 39, 37, 0,
        267, 269, 270, 409, 78, 95, 88, 178,
        87, 14, 317, 402, 318, 324, 308, 191,
        80, 81, 82, 13, 312, 311, 310, 415,
    ],

    "nariz": [
        168, 6, 197, 195, 5, 4, 1, 19,
        94, 2, 98, 97, 326, 327, 294, 278,
        344, 440, 275, 45, 220, 115, 48, 64, 98,
    ],

    "contorno_rosto": [
        10, 338, 297, 332, 284, 251, 389, 356,
        454, 323, 361, 288, 397, 365, 379, 378,
        400, 377, 152, 148, 176, 149, 150, 136,
        172, 58, 132, 93, 234, 127, 162, 21,
        54, 103, 67, 109, 10,
    ],
}

DEFAULT_100_POINT_REGIONS = [
    "sobrancelha_direita",
    "sobrancelha_esquerda",
    "olho_direito",
    "olho_esquerdo",
    "iris_direita",
    "iris_esquerda",
    "labios",
]

def get_points(regions: list[str]) -> list[int]:
    """Retorna a lista combinada de pontos para as regiões especificadas."""
    points = []
    for region in regions:
        if region in FACEMESH_REGIONS:
            points.extend(FACEMESH_REGIONS[region])
    # Como alguns pontos podem ser duplicados se houver overlap, mantemos a ordem usando dict
    return list(dict.fromkeys(points))
