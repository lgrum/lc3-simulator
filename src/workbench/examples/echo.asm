; Echoes each key you type until you press Enter.
        .ORIG x3000
        LEA   R0, PROMPT
        PUTS
LOOP    GETC                ; R0 <- the next key
        OUT                 ; print it
        LD    R1, NEG_LF    ; R1 <- -10, the negative of a line feed
        ADD   R1, R0, R1    ; zero when the key was Enter
        BRnp  LOOP
        HALT
PROMPT  .STRINGZ "Type something: "
NEG_LF  .FILL #-10
        .END
