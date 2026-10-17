; Squares 3 and 4 with modules in lib/ and prints the sum.
; Each call loads the routine's address from a .FILL and uses JSRR,
; which reaches any module however far the linker places it.
; The modules follow the course convention: arguments in R0-R2,
; result in R0, R1-R6 preserved, R7 saved before nested calls.
        .ORIG x3000
        .EXTERNAL POWERS-SQUARE
        .EXTERNAL NUMBERS-PRINT2

        LEA   R0, TITLE
        PUTS
        LD    R5, SQUARE_PTR
        AND   R0, R0, #0
        ADD   R0, R0, #3
        JSRR  R5            ; R0 <- 3 * 3
        ADD   R4, R0, #0    ; R4 keeps 9: modules preserve R1-R6
        AND   R0, R0, #0
        ADD   R0, R0, #4
        JSRR  R5            ; R0 <- 4 * 4
        ADD   R0, R0, R4    ; R0 <- 9 + 16
        LD    R5, PRINT_PTR
        JSRR  R5            ; prints R0 in decimal
        LD    R0, NEWLINE
        OUT
        HALT

SQUARE_PTR .FILL POWERS-SQUARE
PRINT_PTR  .FILL NUMBERS-PRINT2
NEWLINE    .FILL x0A
TITLE      .STRINGZ "3*3 + 4*4 = "
        .END
