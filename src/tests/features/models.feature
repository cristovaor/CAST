Feature: Model Registry
  As a machine learning engineer
  I want to register and manage models
  So that the CAST system can use them for inference

  Scenario: Register a new model
    Given I am an authenticated user
    When I register a model "face-emotion" version "v1.0" with action "smile"
    Then the response status code should be 201
    And the response should contain the model version "v1.0"

  Scenario: List models
    Given I am an authenticated user
    And I have registered a model "face-emotion" version "v1.0" with action "smile"
    When I request the list of models
    Then the response status code should be 200
    And the response should contain at least 1 model
