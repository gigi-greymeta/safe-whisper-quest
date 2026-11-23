import { describe, it, expect, vi } from "vitest";

vi.mock("@capacitor/geolocation", () => ({ Geolocation: {} }));

import { parseCoordinates, parsePinDrop, wrapPinDrop } from "@/lib/location";

describe("pin drops", () => {
  it("round-trips through the message envelope", () => {
    expect(parsePinDrop(wrapPinDrop({ lat: -33.8568, lng: 151.2153, accuracy: 12, label: "Opera House" }))).toEqual({
      lat: -33.8568,
      lng: 151.2153,
      accuracy: 12,
      label: "Opera House",
    });
  });
  it("rejects ordinary text and impossible coordinates", () => {
    expect(parsePinDrop("see you there")).toBeNull();
    expect(parsePinDrop(JSON.stringify({ __type: "pin_drop", lat: 120, lng: 0 }))).toBeNull();
  });
});

describe("parseCoordinates", () => {
  it("reads plain coordinates", () => {
    expect(parseCoordinates("-33.8568, 151.2153")).toEqual({ lat: -33.8568, lng: 151.2153 });
    expect(parseCoordinates("-33.8568 151.2153")).toEqual({ lat: -33.8568, lng: 151.2153 });
  });
  it("reads Google and Apple Maps links", () => {
    expect(parseCoordinates("https://www.google.com/maps/@-31.9523,115.8613,15z")).toEqual({ lat: -31.9523, lng: 115.8613 });
    expect(parseCoordinates("https://maps.apple.com/?ll=-37.8136,144.9631&q=Pin")).toEqual({ lat: -37.8136, lng: 144.9631 });
    expect(parseCoordinates("https://maps.google.com/?q=-27.4698%2C153.0251")).toEqual({ lat: -27.4698, lng: 153.0251 });
  });
  it("returns null when there are no coordinates", () => {
    expect(parseCoordinates("Central Station")).toBeNull();
  });
});
