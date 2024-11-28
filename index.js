const express = require("express");
const { createCanvas, loadImage } = require("canvas");
const axios = require("axios");
const fetch = require("node-fetch");

const app = express();
const PORT = 8080;

// Function to fetch round information
async function fetchRoundInfo(sessionId, roundId) {
    console.log(sessionId, roundId);

    const url = `https://rat.kajotgames.dev/api/history/v3/casinos/1/sessions/${sessionId}/rounds/${roundId}`;
    const response = await axios.get(url);
    console.log(response.data.math_result.reelMatrix);

    if (response.status !== 200) {
        throw new Error(`Failed to fetch round info: ${response.statusText}`);
    }
    return response.data;
}

async function fetchSymbolImage(gameName, symbolId) {
    const imageUrl = `https://games.kajotgames.dev/${gameName}/expose/assets/img/${symbolId}.png`;
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch symbol image for ID ${symbolId}: ${response.statusText}`
        );
    }
    return response.buffer(); // Returns the image as a Buffer
}

function transposeMatrix(matrix) {
    const transposed = [];
    const rows = matrix.length;
    const cols = matrix[0].length;

    for (let col = 0; col < cols; col++) {
        transposed[col] = [];
        for (let row = 0; row < rows; row++) {
            transposed[col][row] = matrix[row][col];
        }
    }

    return transposed;
}

async function generateMatrixImage(
    reelMatrix,
    gameName,
    symbolSize = 100,
    text = "Golden Text",
    blurAmount = 5
) {
    // Extract the 2D matrix from the 3D structure
    const matrix = reelMatrix[0];
    if (!matrix || !Array.isArray(matrix)) {
        throw new Error("Invalid reelMatrix structure");
    }

    const rows = reelMatrix.length;
    const cols = reelMatrix[0].length;

    // Create a canvas large enough to fit the matrix
    const width = cols * symbolSize;
    const height = rows * symbolSize;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);

    // Apply a blur filter to the symbols (background)
    ctx.filter = `blur(${blurAmount}px)`;

    // Draw the blurred symbols in the matrix
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const symbolId = reelMatrix[row][col];
            try {
                const symbolBuffer = await fetchSymbolImage(gameName, symbolId);
                const symbolImage = await loadImage(symbolBuffer);
                const x = col * symbolSize;
                const y = row * symbolSize;
                ctx.drawImage(symbolImage, x, y, symbolSize, symbolSize);
            } catch (error) {
                console.error(
                    `Error loading symbol ID ${symbolId}:`,
                    error.message
                );
                // If an image fails to load, draw a placeholder
                ctx.fillStyle = "gray";
                ctx.fillRect(
                    col * symbolSize,
                    row * symbolSize,
                    symbolSize,
                    symbolSize
                );
                ctx.fillStyle = "white";
                ctx.fillText(
                    "?",
                    col * symbolSize + symbolSize / 2 - 10,
                    row * symbolSize + symbolSize / 2 + 10
                );
            }
        }
    }

    // Now reset the filter to avoid blurring the square and text
    ctx.filter = "none";

    const squareX = 0;
    const squareY = 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(squareX, squareY, width, height);

    // Add golden text in the center of the matrix (above the square and symbols)
    const fontSize = 80;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Create a golden gradient for the text
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#FFD700"); // Gold
    gradient.addColorStop(0.3, "#FFEC8B"); // Light gold
    gradient.addColorStop(0.5, "#FFD700"); // Gold
    gradient.addColorStop(0.7, "#FFA500"); // Dark gold
    gradient.addColorStop(1, "#FFD700"); // Gold
    ctx.fillStyle = gradient;

    // Draw the golden text
    ctx.fillStyle = gradient;
    ctx.fillText(text, width / 2, height / 2);

    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.shadowBlur = 10;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#B8860B"; // Dark gold outline
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

    return canvas.toBuffer(); // Return the matrix image as a buffer
}

app.get(
    "/generate-image/:sessionId/:roundId/:gameName/img.png",
    async (req, res) => {
        const { sessionId, roundId, gameName } = req.params;

        if (!sessionId || !roundId || !gameName) {
            return res
                .status(400)
                .send(
                    "Missing required parameters: sessionId, roundId, gameName"
                );
        }

        try {
            // Fetch round info
            const roundInfo = await fetchRoundInfo(sessionId, roundId);
            const reelMatrix = transposeMatrix(
                roundInfo.math_result?.reelMatrix[0]
            );

            if (!reelMatrix) {
                return res
                    .status(400)
                    .send("Round data does not contain a reelMatrix");
            }
            console.log(roundInfo);

            // Generate the symbol matrix image
            const imageBuffer = await generateMatrixImage(
                reelMatrix,
                gameName,
                undefined,
                Number(roundInfo.win).toLocaleString("en")
            );

            // Send the generated image as the response
            res.writeHead(200, { "Content-Type": "image/png" });
            res.end(imageBuffer);
        } catch (error) {
            console.error("Error:", error.message);
            res.status(500).send(`Error generating image: ${error.message}`);
        }
    }
);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
