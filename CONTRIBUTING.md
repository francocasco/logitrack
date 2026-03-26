# Estrategia de ramas

Implica el uso de “branches” de git en nuestro proyecto, que pueden verse como repositorios alternativos, los cuales pueden luego ser combinados (merging), entre otras cosas. Estos tienen la utilidad de trabajar en ambientes con propósitos diferentes, como branches “experimental”, donde se pueden hacer commits sin preocupación de dañar el repositorio, entre otros propósitos, “master” utilizado para lanzamientos (en nuestro caso, el MVP).
En nuestro caso, podriamos hacer que “main” haga branch en “development”, y que development se abra en multiples ramas de diferentes funcionalidades o propositos. Luego todo se va mergeando hacia main, eventualmente.
por el momento, tenemos “refactor” y “structure” como subramas de development


# Convención de commits

Posiblemente sea tener un estándar en la forma en que hacemos commits; que sigan el mismo formato, y nivel de detalle. Investigar o preguntar al profe.
Por el momento, podemos utilizar este formato:
Para cada cambio particular:
TIPO(TOPICO): EXPLICACIÓN BREVE

ejemplos de “TIPOS” pueden ser: 
funcion (Se agrega funcionalidad nueva)
corección (Se arregla uno o multiples bugs)
documntacion (Se agrega o edita documentacion)
estilización (Se modifica formato o estilo del codigo)
estructuración (cambios en la estructura, mover archivos, carpetas nuevas)
refactorizacion (Se modifica codigo sin cambiar proposito)
testing (Tests unitarios)
TOPICO debería ser el tema que esta siendo modificado. si se usa el tipo funcion, se describe que user story esta siendo programada, si se usa el tipo corrección, se aclara que funcionalidad esta siendo corregida

Y descripcion breve es… una descripcion breve.

Adicionalmente, deberíamos evitar hacer commits masivos o multi-funcionales, generalmente haciendo un commit que involucre un solo tipo, y un solo topico.

Entonces, un ejemplo de commit:

funcion(autenticacion): se agrego funcionalidad de autenticacion de usuario
