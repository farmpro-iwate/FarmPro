import '@testing-library/jest-dom/vitest';

if (!File.prototype.text) {
  File.prototype.text = function () {
    return new Response(this).text();
  };
}
