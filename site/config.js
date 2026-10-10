// Local pages talk to the local Worker; production talks to the deployed one
window.CONFIG = {
  API: ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8821"
    : "https://uw-news-digest.uw-course-api.workers.dev",
};
