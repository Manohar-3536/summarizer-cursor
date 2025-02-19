document.addEventListener("DOMContentLoaded", function () {
    const uploadBox = document.querySelector(".upload-box");
    const fileInput = document.getElementById("fileUpload");

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach(event => {
        uploadBox.addEventListener(event, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Highlight box on drag over
    uploadBox.addEventListener("dragover", () => {
        uploadBox.style.borderColor = "#ff9800";
        uploadBox.style.background = "rgba(255, 152, 0, 0.2)";
    });

    // Remove highlight when drag leaves
    uploadBox.addEventListener("dragleave", () => {
        uploadBox.style.borderColor = "#007bff";
        uploadBox.style.background = "transparent";
    });

    // Handle file drop
    uploadBox.addEventListener("drop", (event) => {
        event.preventDefault();
        uploadBox.style.borderColor = "#007bff";
        uploadBox.style.background = "transparent";

        const files = event.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files; // Assign dropped file to input
            handleFileUpload(files[0]);
        }
    });

    // Handle file selection via browse button
    fileInput.addEventListener("change", function () {
        if (fileInput.files.length > 0) {
            handleFileUpload(fileInput.files[0]);
        }
    });

    // Function to process uploaded file
    function handleFileUpload(file) {
        if (file.type.startsWith("video/")) {
            alert(`File Uploaded: ${file.name}`);
        } else {
            alert("Please upload a valid video file.");
        }
    }
});
