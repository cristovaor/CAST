Feature: Annotations
  As an annotator
  I want to create annotation tasks and events
  So that I can label facial microactions

  Scenario: Create an annotation task
    Given I am an authenticated user
    And a valid participant ID
    And an uploaded video exists
    When I create an annotation task for the video
    Then the response status code should be 201
    And the response should contain a task_id

  Scenario: Add an event to a task
    Given I am an authenticated user
    And a valid participant ID
    And an uploaded video exists
    And an annotation task exists
    When I add an annotation event from 0.0 to 1.5 seconds
    Then the response status code should be 201
    And the response should contain an event_id
