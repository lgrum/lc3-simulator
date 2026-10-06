; Prints a greeting with the PUTS trap.
        .ORIG x3000
        LEA   R0, GREETING  ; R0 <- address of the string
        PUTS                ; print the string that R0 points to
        HALT
GREETING .STRINGZ "Hello, LC-3!"
        .END
