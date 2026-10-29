# Las tres letras de la tarjeta de presentación del taller, recortadas para la página de inicio
# (src/landing/assets/fonts/). Salen de los paquetes @fontsource-variable (devDependencies):
#
#   - Archivo Expanded ExtraBold Italic: la del logo RESTORIFY. Los títulos.
#   - Montserrat: la del lema REPAIR • RESTORE • PERFORM. Botones, menú y etiquetas.
#   - Open Sans: la de los teléfonos y la dirección. El texto.
#
# Cada una queda solo con los ejes y los pesos que usa la página y con los caracteres del inglés y
# del español: así pesan una fracción de los archivos originales y se pueden precargar. Si la página
# empieza a usar otro peso u otro ancho, agrégalo aquí y vuelve a correrlo.
#
# Uso (una vez, en un entorno de Python aparte): python -m pip install fonttools brotli
#   python scripts/landing/recortar-fuentes.py
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'node_modules' / '@fontsource-variable'
OUT = ROOT / 'src' / 'landing' / 'assets' / 'fonts'

# Latín básico y Latin-1 (á, ñ, ¿, ¡, ü, ·) más comillas, rayas, viñeta y puntos suspensivos.
UNICODES = [*range(0x20, 0x7F), *range(0xA0, 0x100), 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026]

FONTS = [
    # (archivo de origen, ejes que se dejan, salida)
    ('archivo/files/archivo-latin-wdth-italic.woff2', {'wdth': (112, 125), 'wght': (700, 800)}, 'archivo-expanded-italic.woff2'),
    ('montserrat/files/montserrat-latin-wght-normal.woff2', {'wght': (500, 700)}, 'montserrat.woff2'),
    ('open-sans/files/open-sans-latin-wdth-normal.woff2', {'wdth': (87.5, 100), 'wght': (400, 700)}, 'open-sans.woff2'),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source, axes, name in FONTS:
        font = instantiateVariableFont(TTFont(SOURCE / source), axes, updateFontNames=False)
        options = subset.Options()
        options.flavor = 'woff2'
        options.hinting = False
        options.desubroutinize = True
        options.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'tnum', 'lnum']
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=UNICODES)
        subsetter.subset(font)
        target = OUT / name
        font.flavor = 'woff2'
        font.save(target)
        print(f'{target.relative_to(ROOT)}: {round(target.stat().st_size / 1024)} KB')


if __name__ == '__main__':
    main()
