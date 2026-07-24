Feature: Video Upload
  As a researcher
  I want to upload a video for a participant
  So that I can analyze their facial microactions

  Scenario: Request a presigned upload URL
    Given a valid participant ID
    When I request an upload URL for "test_video.mp4"
    Then I should receive a valid presigned URL
    And a VideoAsset draft should be created in the database
