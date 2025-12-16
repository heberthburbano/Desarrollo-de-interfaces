const STORY_DATA = {
    "start": {
        "id": "start",
        "layout": "layout-hero",
        "panels": [
            {
                "type": "image",
                "src": "assets/start.png",
                "caption": "Sistema: CRÍTICO. Integridad neuronal: 12%."
            },
            {
                "type": "text",
                "content": "Te despiertas con sabor a cobre en la boca. El apartamento cápsula huele a ozono y sudor frío. En tu visión periférica, un mensaje de error parpadea en rojo violento: 'CORRUPCIÓN DE DATOS INMINENTE'. El chip en tu corteza cerebral está hirviendo. Tienes menos de una hora antes de que tu cerebro se licúe."
            }
        ],
        "choices": [
            { "text": "Mirarse al espejo (Evaluar daños)", "target": "espejo" },
            { "text": "Salir a la calle (Buscar ayuda urgente)", "target": "calle_lluviosa" }
        ]
    },

    "espejo": {
        "id": "espejo",
        "layout": "layout-split",
        "panels": [
            {
                "type": "image",
                "src": "assets/espejo.png",
                "caption": "Tus ojos brillan con estática."
            },
            {
                "type": "text",
                "content": "Te miras en el espejo roto. Venas negras trepan por tu cuello. No eres solo un mensajero, eres un envase con fecha de caducidad. Recuerdas un nombre: 'Víbora', un ripperdoc que opera en los bajos fondos de Lavapiés Cyberpunk."
            }
        ],
        "choices": [
            { "text": "Tomar estimulantes y salir", "target": "calle_lluviosa" }
        ]
    },

    "calle_lluviosa": {
        "id": "calle_lluviosa",
        "layout": "layout-classic",
        "panels": [
            {
                "type": "image",
                "src": "assets/calle_lluviosa.png",
                "caption": "La lluvia ácida quema la piel expuesta."
            },
            {
                "type": "text",
                "content": "Neo-Madrid ruge bajo la lluvia. Los neones de las corporaciones se reflejan en los charcos de aceite. Tienes dos pistas sobre el paradero de 'Víbora'. Se dice que frecuenta el bar 'El Matadero' para hacer tratos, o podrías intentar colarte directamente en su clínica ilegal, aunque está protegida por torretas."
            }
        ],
        "choices": [
            { "text": "Ir al Bar 'El Matadero'", "target": "bar_matadero" },
            { "text": "Ir a la Clínica (Sigilo)", "target": "callejon_clinica" },
            { "text": "Pedir ayuda a un policía (Arriesgado)", "target": "policia_muerte" }
        ]
    },

    "policia_muerte": {
        "id": "policia_muerte",
        "layout": "layout-hero",
        "panels": [
            {
                "type": "image",
                "src": "assets/policia_muerte.png",
                "caption": "ERROR FATAL"
            },
            {
                "type": "text",
                "content": "Te acercas a un androide de la Guardia Civil. Escanea tu chip ilegal en milisegundos. Antes de que puedas hablar, una porra eléctrica te fríe el sistema nervioso. En Neo-Madrid, tener un chip modificado es pena de muerte."
            }
        ],
        "choices": [
            { "text": "Reiniciar Sistema", "target": "start" }
        ]
    },

    "bar_matadero": {
        "id": "bar_matadero",
        "layout": "layout-split",
        "panels": [
            {
                "type": "image",
                "src": "assets/bar_matadero.png",
                "caption": "Música industrial y humo denso."
            },
            {
                "type": "text",
                "content": "El bar apesta a ginebra sintética. En una esquina oscura, ves a un contacto de Víbora. Un tipo enorme con un brazo robótico oxidado. Te pide 500 créditos por la ubicación exacta."
            }
        ],
        "choices": [
            { "text": "Pagarle (Te quedas sin fondos)", "target": "clinica_entrada" },
            { "text": "Amenazarle con tu arma", "target": "pelea_bar" }
        ]
    },

    "pelea_bar": {
        "id": "pelea_bar",
        "layout": "layout-hero",
        "panels": [
            {
                "type": "text",
                "content": "Sacas tu pistola, pero tu chip falla en el peor momento. Tu visión se congela. Sientes un golpe seco en la nuca. Todo se vuelve negro."
            },
            {
                "type": "image",
                "src": "assets/pelea_bar.png",
                "caption": "Has sido desconectado."
            }
        ],
        "choices": [
            { "text": "Intentarlo de nuevo", "target": "start" }
        ]
    },

    "callejon_clinica": {
        "id": "callejon_clinica",
        "layout": "layout-classic",
        "panels": [
            {
                "type": "image",
                "src": "assets/callejon_clinica.png",
                "caption": "Cables colgando y basura tecnológica."
            },
            {
                "type": "text",
                "content": "El callejón trasero de la clínica está sucio. Hay un escáner de retina en la puerta de servicio. Podrías intentar hackearlo con el poco software que te queda operativo, o forzar la cerradura manualmente."
            }
        ],
        "choices": [
            { "text": "Hackear panel (Usa salud mental)", "target": "hackeo_puerta" },
            { "text": "Forzar puerta (Fuerza bruta)", "target": "alarma_clinica" }
        ]
    },

    "alarma_clinica": {
        "id": "alarma_clinica",
        "layout": "layout-split",
        "panels": [
            {
                "type": "image",
                "src": "assets/alarma_clinica.png",
                "caption": "Sistema de defensa activado."
            },
            {
                "type": "text",
                "content": "Mala idea. Al forzar la puerta, activas las defensas automáticas. Las torretas láser no hacen preguntas."
            }
        ],
        "choices": [
            { "text": "Fin de la partida", "target": "start" }
        ]
    },

    "hackeo_puerta": {
        "id": "hackeo_puerta",
        "layout": "layout-classic",
        "panels": [
            {
                "type": "text",
                "content": "Conectas tu interfaz neuronal. El dolor es cegador, pero logras saltar el firewall. La puerta se desliza con un siseo hidráulico. Estás dentro."
            },
            {
                "type": "image",
                "src": "assets/hackeo_puerta.png",
                "caption": ""
            }
        ],
        "choices": [
            { "text": "Entrar al quirófano", "target": "quirofano_final" }
        ]
    },

    "clinica_entrada": {
        "id": "clinica_entrada",
        "layout": "layout-split",
        "panels": [
            {
                "type": "text",
                "content": "Con la información comprada, llegas a la puerta principal. Introduces el código. La puerta se abre. El lugar está inquietantemente limpio en comparación con la calle."
            },
            {
                "type": "image",
                "src": "assets/clinica_entrada.png",
                "caption": "Quirófano estéril."
            }
        ],
        "choices": [
            { "text": "Entrar al quirófano", "target": "quirofano_final" }
        ]
    },

    "quirofano_final": {
        "id": "quirofano_final",
        "layout": "layout-hero",
        "panels": [
            {
                "type": "image",
                "src": "assets/quirofano_final.png",
                "caption": "Tiene cuatro brazos robóticos quirúrgicos."
            },
            {
                "type": "text",
                "content": "Víbora te espera. 'Llegas tarde, mensajero. Tu cerebro es papilla'. Te ofrece dos opciones: Extraer el chip y salvar tu vida pero perder tus recuerdos (y los datos), o intentar una fusión experimental que podría matarte o convertirte en un dios de la red."
            }
        ],
        "choices": [
            { "text": "Extracción segura (Perder recuerdos)", "target": "final_triste" },
            { "text": "Fusión experimental (Todo o nada)", "target": "final_ascension" }
        ]
    },

    "final_triste": {
        "id": "final_triste",
        "layout": "layout-split",
        "panels": [
            {
                "type": "image",
                "src": "assets/final_triste.png",
                "caption": "FINAL NEUTRO/MALO"
            },
            {
                "type": "text",
                "content": "Te despiertas tres días después. Estás vivo. La lluvia sigue cayendo sobre Madrid. No recuerdas tu nombre, ni por qué te duele el pecho. Eres un cascarón vacío, otro fantasma más en la ciudad. Pero estás vivo."
            }
        ],
        "choices": [
            { "text": "Reiniciar Historia", "target": "start" }
        ]
    },

    "final_ascension": {
        "id": "final_ascension",
        "layout": "layout-hero",
        "panels": [
            {
                "type": "image",
                "src": "assets/final_ascension.png",
                "caption": "FINAL BUENO / TRANSHUMANO"
            },
            {
                "type": "text",
                "content": "El dolor es infinito por un segundo, y luego... silencio. Ves el código de Matrix de Neo-Madrid. Puedes apagar las luces de la ciudad con un pensamiento. Ya no eres un mensajero. Eres la red. Has sobrevivido y evolucionado."
            }
        ],
        "choices": [
            { "text": "Jugar de nuevo", "target": "start" }
        ]
    }
};